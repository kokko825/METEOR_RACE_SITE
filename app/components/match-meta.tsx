import type { CSSProperties, ReactNode } from "react";

type MatchMetaProps = {
  language: "ja" | "en";
  progress: number;
  roundLabel: string;
  roundNumber: number;
  rankedDetails?: ReactNode;
};

/** Header-only match telemetry, independent from game actions and networking. */
export function MatchMeta({ language, progress, roundLabel, roundNumber, rankedDetails }: MatchMetaProps) {
  return <div className="match-meta"><div className="regula-console" style={{ "--regula-progress": `${progress}%` } as CSSProperties} aria-label={`REGULA core arrival progress ${progress}%`}><span><small>{language === "ja" ? "REGULA // CORE到達管制" : "REGULA // CORE ARRIVAL CONTROL"}</small><i><b /></i><em>{language === "ja" ? `最接近機の到達度 ${progress}%` : `NEAREST PROBE ${progress}%`}</em></span></div><div className="round">{roundLabel} {roundNumber}{rankedDetails}</div></div>;
}
