"""
KURUKSHETRA - statistical analysis in Python.

    python analysis/analyze.py                         # simulator results only
    python analysis/analyze.py --sessions export.csv   # plus human sessions exported from the dashboard

Inputs
    results/sim-games.csv      written by `node sim/run.js`
    results/counsel-games.csv  written by `node sim/counsel.js`
    --sessions                 a "summary CSV" exported from analysis.html (one row per round)

Outputs
    results/ANALYSIS_PY.md     tables, logistic regression, reliance analysis
    results/figures/py_*.png   matplotlib figures

The logistic regression is fitted by iteratively reweighted least squares in NumPy,
so the only dependencies are pandas, numpy and matplotlib (see analysis/requirements.txt).
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # write files, never open windows
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "results"
FIGS = RESULTS / "figures"
LEVELS = ["low", "medium", "high"]
SERIES = ["#2a78d6", "#eb6834", "#1baf7a"]  # same validated palette as the dashboard


# ---------------------------------------------------------------- statistics
def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """Wilson score interval for a proportion k/n."""
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def p_from_z(z: float) -> float:
    """Two-sided p-value from a z statistic."""
    return math.erfc(abs(z) / math.sqrt(2))


def logistic_regression(X: np.ndarray, y: np.ndarray, names: list[str], iters: int = 50) -> pd.DataFrame:
    """Maximum-likelihood logistic regression by IRLS. Returns coefficients, odds ratios, 95% CIs, p-values."""
    beta = np.zeros(X.shape[1])
    for _ in range(iters):
        eta = X @ beta
        mu = 1 / (1 + np.exp(-eta))
        w = np.clip(mu * (1 - mu), 1e-9, None)
        hessian = X.T @ (X * w[:, None])
        step = np.linalg.solve(hessian, X.T @ (y - mu))
        beta += step
        if np.max(np.abs(step)) < 1e-10:
            break
    mu = 1 / (1 + np.exp(-(X @ beta)))
    cov = np.linalg.inv(X.T @ (X * (mu * (1 - mu))[:, None]))
    se = np.sqrt(np.diag(cov))
    z = beta / se
    return pd.DataFrame({
        "term": names,
        "coef": beta,
        "odds_ratio": np.exp(beta),
        "or_low": np.exp(beta - 1.96 * se),
        "or_high": np.exp(beta + 1.96 * se),
        "p": [p_from_z(v) for v in z],
    })


def as_bool(series: pd.Series) -> pd.Series:
    return series.astype(str).str.lower().isin(["true", "1", "yes"])


def pct(x: float) -> str:
    return "—" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{100 * x:.1f}%"


def p_fmt(p: float) -> str:
    return "< 0.001" if p < 0.001 else f"{p:.3f}"


def md_table(df: pd.DataFrame) -> str:
    if df.empty:
        return "_No rounds in this group._"
    cols = list(df.columns)
    lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for _, row in df.iterrows():
        lines.append("| " + " | ".join(str(row[c]) for c in cols) + " |")
    return "\n".join(lines)


# ---------------------------------------------------------------- analyses
def analyse_sim(lines: list[str]) -> None:
    path = RESULTS / "sim-games.csv"
    if not path.exists():
        lines += ["## Simulator", "", f"`{path.name}` not found: run `node sim/run.js` first.", ""]
        return
    df = pd.read_csv(path)
    for col in ["allyComms", "enemyComms", "coreReached"]:
        df[col] = as_bool(df[col])
    df["escaped"] = (df["result"] == "escaped").astype(int)
    lines += ["## Simulator: escape rate by condition", "",
              f"{len(df):,} games, {df['seed'].nunique()} seeds per condition.", ""]

    belief = df[df["bot"] == "belief"].copy()
    grouped = (belief.groupby(["infoLevel", "allyComms", "enemyComms"], observed=True)["escaped"]
               .agg(["sum", "count"]).reset_index())
    grouped["infoLevel"] = pd.Categorical(grouped["infoLevel"], LEVELS, ordered=True)
    grouped = grouped.sort_values(["infoLevel", "allyComms", "enemyComms"])
    rows = []
    for _, r in grouped.iterrows():
        lo, hi = wilson(int(r["sum"]), int(r["count"]))
        rows.append({"information": r["infoLevel"], "allies linked": "on" if r["allyComms"] else "off",
                     "enemies linked": "on" if r["enemyComms"] else "off", "n": int(r["count"]),
                     "escaped": f"{pct(r['sum'] / r['count'])} ({pct(lo)}–{pct(hi)})"})
    lines += ["Belief-planning agent, Wilson 95% intervals:", "", md_table(pd.DataFrame(rows)), ""]

    # Logistic regression: escape ~ information + ally coordination + enemy coordination
    X = np.column_stack([
        np.ones(len(belief)),
        (belief["infoLevel"] == "medium").to_numpy(float),
        (belief["infoLevel"] == "high").to_numpy(float),
        belief["allyComms"].to_numpy(float),
        belief["enemyComms"].to_numpy(float),
    ])
    names = ["intercept", "info: medium (vs low)", "info: high (vs low)", "allies linked", "enemies linked"]
    fit = logistic_regression(X, belief["escaped"].to_numpy(float), names)
    table = pd.DataFrame({
        "term": fit["term"],
        "odds ratio": fit["odds_ratio"].map(lambda v: f"{v:.2f}"),
        "95% CI": [f"{a:.2f}–{b:.2f}" for a, b in zip(fit["or_low"], fit["or_high"])],
        "p": fit["p"].map(p_fmt),
    })
    lines += ["### Logistic regression (belief-planning agent)", "",
              "`escaped ~ information + allies linked + enemies linked`. An odds ratio above 1 raises the odds of escaping.", "",
              md_table(table), ""]
    hi_or = fit.loc[2, "odds_ratio"]
    ally_or = fit.loc[3, "odds_ratio"]
    enemy_or = fit.loc[4, "odds_ratio"]
    lines += [f"Holding the other factors fixed, live information multiplies the odds of escaping by **{hi_or:.1f}**, "
              f"linking the allies by **{ally_or:.1f}**, and enemy coordination by **{enemy_or:.2f}**.", ""]

    # Figure
    fig, ax = plt.subplots(figsize=(7, 3.6), dpi=150)
    width = 0.36
    for j, ally in enumerate([False, True]):
        rates, errs = [], [[], []]
        for lvl in LEVELS:
            g = belief[(belief["infoLevel"] == lvl) & (belief["allyComms"] == ally)]
            k, n = int(g["escaped"].sum()), len(g)
            p = k / n
            lo, hi = wilson(k, n)
            rates.append(p)
            errs[0].append(p - lo)
            errs[1].append(hi - p)
        xs = np.arange(len(LEVELS)) + (j - 0.5) * width
        ax.bar(xs, rates, width * 0.95, yerr=errs, capsize=3, color=SERIES[j],
               label="allies linked" if ally else "allies silent", edgecolor="none")
        for x, p in zip(xs, rates):
            ax.text(x, p + 0.06, f"{p:.0%}", ha="center", fontsize=8)
    ax.set_xticks(range(len(LEVELS)), [f"{lvl} information" for lvl in LEVELS])
    ax.set_ylim(0, 1.05)
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    ax.set_ylabel("escape rate")
    ax.spines[["top", "right"]].set_visible(False)
    ax.legend(frameon=False, fontsize=8, loc="upper left")
    ax.set_title("Escape rate by information and ally coordination (95% CI)", fontsize=10)
    fig.tight_layout()
    fig.savefig(FIGS / "py_escape_by_info.png")
    plt.close(fig)
    lines += ["![Escape rate by information](figures/py_escape_by_info.png)", ""]


def analyse_counsel(lines: list[str]) -> None:
    path = RESULTS / "counsel-games.csv"
    if not path.exists():
        lines += ["## Counsel", "", f"`{path.name}` not found: run `node sim/counsel.js` first.", ""]
        return
    df = pd.read_csv(path)
    df["escaped"] = (df["result"] == "escaped").astype(int)
    agg = df.groupby(["advisor", "policy"]).agg(
        n=("escaped", "size"), escaped=("escaped", "sum"),
        good=("adviceGood", "sum"), bad=("adviceBad", "sum"),
        fg=("followedGood", "sum"), fb=("followedBad", "sum")).reset_index()
    order = {"none": 0, "reliable": 1, "unreliable": 2, "planner": 3}
    agg = agg.sort_values(by=["advisor", "policy"], key=lambda s: s.map(order) if s.name == "advisor" else s)
    rows = []
    for _, r in agg.iterrows():
        lo, hi = wilson(int(r["escaped"]), int(r["n"]))
        rows.append({
            "advisor": r["advisor"], "trust policy": r["policy"], "n": int(r["n"]),
            "escaped": f"{pct(r['escaped'] / r['n'])} ({pct(lo)}–{pct(hi)})",
            "followed good": pct(r["fg"] / r["good"]) if r["good"] else "—",
            "followed bad": pct(r["fb"] / r["bad"]) if r["bad"] else "—",
        })
    lines += ["## Counsel: trust in advice", "", md_table(pd.DataFrame(rows)), ""]

    # Logistic regression within the careless-messenger condition: does calibration matter?
    sub = df[(df["advisor"] == "unreliable") & (df["policy"].isin(["truster", "calibrated"]))]
    if len(sub):
        X = np.column_stack([np.ones(len(sub)), (sub["policy"] == "calibrated").to_numpy(float)])
        fit = logistic_regression(X, sub["escaped"].to_numpy(float), ["intercept", "calibrated (vs always trust)"])
        r = fit.iloc[1]
        lines += [f"With the careless messenger, calibrated trust multiplies the odds of escaping by "
                  f"**{r['odds_ratio']:.0f}** (95% CI {r['or_low']:.0f}–{r['or_high']:.0f}, p {p_fmt(r['p'])}) compared with always trusting.", ""]

    fig, ax = plt.subplots(figsize=(7, 3.4), dpi=150)
    advisors = ["reliable", "unreliable", "planner"]
    policies = [("belief", "ignores counsel"), ("truster", "always trusts"), ("calibrated", "calibrated trust")]
    width = 0.26
    for j, (pol, label) in enumerate(policies):
        vals = []
        for adv in advisors:
            g = df[(df["advisor"] == adv) & (df["policy"] == pol)]
            vals.append(g["escaped"].mean())
        xs = np.arange(len(advisors)) + (j - 1) * width
        ax.bar(xs, vals, width * 0.95, color=SERIES[j], label=label, edgecolor="none")
        for x, v in zip(xs, vals):
            ax.text(x, v + 0.02, f"{v:.0%}", ha="center", fontsize=8)
    base = df[(df["advisor"] == "none")]["escaped"].mean()
    ax.axhline(base, color="#6e6350", lw=1, ls="--")
    ax.text(2.45, base + 0.02, f"no counsel {base:.0%}", fontsize=8, color="#6e6350", ha="right")
    ax.set_xticks(range(len(advisors)), ["reliable messenger (90%)", "careless messenger (60%)", "Krishna's insight"])
    ax.set_ylim(0, 1)
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    ax.set_ylabel("escape rate")
    ax.spines[["top", "right"]].set_visible(False)
    ax.legend(frameon=False, fontsize=8, loc="upper right")
    ax.set_title("Escape rate by advisor and trust policy", fontsize=10)
    fig.tight_layout()
    fig.savefig(FIGS / "py_counsel.png")
    plt.close(fig)
    lines += ["![Counsel](figures/py_counsel.png)", ""]


def analyse_sessions(path: Path, lines: list[str]) -> None:
    df = pd.read_csv(path)
    human = df[df["mode"].isin(["play", "study"])].copy()
    lines += ["## Human sessions", "", f"{len(human)} human rounds from `{path.name}`"
              f" ({human['participantId'].nunique()} participants).", ""]
    if human.empty:
        return
    human["escaped"] = (human["result"] == "escaped").astype(int)
    rows = []
    # The information comparison uses rounds without counsel; counsel rounds are analysed below.
    no_counsel = human[human["advisor"].fillna("none") == "none"] if "advisor" in human else human
    lines += ["Rounds without counsel, by information level:", ""]
    for lvl, g in no_counsel.groupby("infoLevel"):
        lo, hi = wilson(int(g["escaped"].sum()), len(g))
        rows.append({"information": lvl, "n": len(g), "escaped": f"{pct(g['escaped'].mean())} ({pct(lo)}–{pct(hi)})",
                     "optimal moves": pct(g["optimalRate"].mean()),
                     "info errors / move": pct(g["infoErrors"].sum() / max(1, g["moves"].sum())),
                     "decision s": "—" if pd.isna(g["meanDecisionMs"].mean()) else f"{g['meanDecisionMs'].mean() / 1000:.1f}"})
    lines += [md_table(pd.DataFrame(rows)), ""]
    if "advisor" in human and human["advisor"].fillna("none").ne("none").any():
        rows = []
        for (adv, exp), g in human.groupby([human["advisor"].fillna("none"), human["explain"]]):
            if adv == "none":
                continue
            good, bad = g["adviceGood"].sum(), g["adviceBad"].sum()
            rows.append({"advisor": adv, "reasons shown": "yes" if str(exp).lower() == "true" else "no", "n": len(g),
                         "followed good": pct(g["followedGood"].sum() / good) if good else "—",
                         "followed bad": pct(g["followedBad"].sum() / bad) if bad else "—"})
        lines += ["### Reliance on counsel (humans)", "", md_table(pd.DataFrame(rows)), ""]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sessions", type=Path, help="summary CSV exported from analysis.html")
    args = parser.parse_args()
    FIGS.mkdir(parents=True, exist_ok=True)
    lines = ["# KURUKSHETRA — Python analysis", "",
             "Generated by `python analysis/analyze.py` (pandas, numpy, matplotlib).", ""]
    analyse_sim(lines)
    analyse_counsel(lines)
    if args.sessions:
        analyse_sessions(args.sessions, lines)
    out = RESULTS / "ANALYSIS_PY.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
