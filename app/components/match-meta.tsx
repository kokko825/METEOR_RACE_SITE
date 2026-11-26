import type { CSSProperties, ReactNode } from "react";

type MatchMetaProps = {
  language: "ja" | "en";
  progress: number;
  distance: number;
  leader: string;
  roundLabel: string;
  roundNumber: number;
  rankedDetails?: ReactNode;
  eventDetails?: ReactNode;
};

/** Header-only match telemetry, independent from game actions and networking. */
export function MatchMeta({ language, progress, distance, leader, roundLabel, roundNumber, rankedDetails, eventDetails }: MatchMetaProps) {
  return <div className="match-meta">
    <div className="regula-console" style={{ "--regula-progress": `${progress}%` } as CSSProperties}>
      <span><small>{language === "ja" ? "AEQRIS // CORE到達管制" : "AEQRIS // CORE ARRIVAL CONTROL"}</small><i aria-hidden="true"><b /></i><em><strong>{language === "ja" ? "最接近" : "Nearest"}: {leader}</strong><span> · {language === "ja" ? `COREまで${distance}マス` : `${distance} cells to CORE`}</span></em></span>
    </div>
    <div className="round">{roundLabel} {roundNumber}{rankedDetails}</div>
    {eventDetails}
  </div>;
}
