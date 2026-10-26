/**
 * Example print art for the demo run on the landing page: type-led designs
 * authored as vector artwork, shown on a garment-colour preview the way the
 * app previews a design. Labelled as example data wherever it appears.
 */

const LEAFLETS = [0, 1, 2, 3, 4] as const;
const LEAFLET_GAP = 9;
const LEAFLET_TOP = 70;

export const FernStudyArt = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    viewBox="0 0 200 200"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect fill="#24392d" height="200" width="200" />
    <defs>
      <path d="M40 100a60 60 0 1 1 120 0" id="moss-top" />
      <path d="M44 100a56 56 0 0 0 112 0" id="moss-bottom" />
    </defs>
    <circle
      cx="100"
      cy="100"
      fill="none"
      r="74"
      stroke="#e9e2cc"
      strokeWidth="2"
    />
    <circle
      cx="100"
      cy="100"
      fill="none"
      r="44"
      stroke="#9db783"
      strokeWidth="1.5"
    />
    <text
      fill="#e9e2cc"
      style={{ fontFamily: "var(--font-familjen), sans-serif" }}
      fontSize="13"
      fontWeight="700"
      letterSpacing="2"
    >
      <textPath href="#moss-top" startOffset="50%" textAnchor="middle">
        FERN STUDY · NO. 3
      </textPath>
    </text>
    <text
      fill="#9db783"
      style={{ fontFamily: "var(--font-geist-mono), monospace" }}
      fontSize="9"
      letterSpacing="2.5"
    >
      <textPath href="#moss-bottom" startOffset="50%" textAnchor="middle">
        SPRING CAPSULE
      </textPath>
    </text>
    <path
      d="M100 66v68"
      stroke="#9db783"
      strokeLinecap="round"
      strokeWidth="2.5"
    />
    {LEAFLETS.map((index) => {
      const y = LEAFLET_TOP + index * LEAFLET_GAP;
      const reach = 10 + index * 3;
      return (
        <g key={index}>
          <ellipse
            cx={100 - reach / 2 - 2}
            cy={y + 4}
            fill="#9db783"
            rx={reach / 2}
            ry="3"
            transform={`rotate(-24 ${100 - reach / 2 - 2} ${y + 4})`}
          />
          <ellipse
            cx={100 + reach / 2 + 2}
            cy={y + 4}
            fill="#9db783"
            rx={reach / 2}
            ry="3"
            transform={`rotate(24 ${100 + reach / 2 + 2} ${y + 4})`}
          />
        </g>
      );
    })}
  </svg>
);

export const GardenHoursArt = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    viewBox="0 0 200 200"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect fill="#c4c6c8" height="200" width="200" />
    <g
      fill="#1f2a24"
      style={{ fontFamily: "var(--font-familjen), sans-serif" }}
      fontWeight="400"
      textAnchor="middle"
    >
      <text fontSize="44" letterSpacing="-1" x="100" y="96">
        garden
      </text>
      <text fontSize="44" letterSpacing="-1" x="100" y="136">
        hours
      </text>
    </g>
    <path d="M58 150h84" stroke="#1f2a24" strokeWidth="1" />
    <text
      fill="#1f2a24"
      style={{ fontFamily: "var(--font-geist-mono), monospace" }}
      fontSize="8"
      letterSpacing="2"
      textAnchor="middle"
      x="100"
      y="164"
    >
      OPEN UNTIL DUSK
    </text>
  </svg>
);
