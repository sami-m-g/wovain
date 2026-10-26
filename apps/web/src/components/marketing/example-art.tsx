import { cn } from "@wovain/ui/lib/utils";
import type { ReactNode } from "react";

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

const SEEDS = [0, 1, 2, 3] as const;
const SEED_GAP = 18;
const SEED_STEP = 30;
const SEED_LEFT = 55;
const SEED_TOP = 58;
const SEED_ACCENT_EVERY = 3;

export const BalconyClubArt = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    viewBox="0 0 200 200"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect fill="#efe6d2" height="200" width="200" />
    <rect
      fill="none"
      height="120"
      rx="60"
      stroke="#7a2e3b"
      strokeWidth="3"
      width="120"
      x="40"
      y="40"
    />
    <path
      d="M62 130h76M68 130v-20M82 130v-20M96 130v-20M110 130v-20M124 130v-20M138 130v-20M62 110h76"
      stroke="#7a2e3b"
      strokeWidth="2.5"
    />
    <path
      d="M98 108c-14-10-16-24-4-32 4 10 8 18 4 32zm4 0c10-12 22-14 28-6-8 6-16 8-28 6z"
      fill="#3f6b4a"
    />
    <text
      fill="#7a2e3b"
      style={{ fontFamily: "var(--font-familjen), sans-serif" }}
      fontSize="15"
      fontWeight="700"
      letterSpacing="3"
      textAnchor="middle"
      x="100"
      y="72"
    >
      BALCONY
    </text>
    <text
      fill="#7a2e3b"
      style={{ fontFamily: "var(--font-geist-mono), monospace" }}
      fontSize="8"
      letterSpacing="3"
      textAnchor="middle"
      x="100"
      y="148"
    >
      CLUB · EST. SPRING
    </text>
  </svg>
);

export const SeedLibraryArt = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    viewBox="0 0 200 200"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect fill="#2c2a3a" height="200" width="200" />
    {SEEDS.map((row) =>
      SEEDS.map((column) => {
        const cx = SEED_LEFT + column * SEED_STEP;
        const cy = SEED_TOP + row * SEED_GAP;
        return (
          <ellipse
            cx={cx}
            cy={cy}
            fill={
              (row + column) % SEED_ACCENT_EVERY === 0 ? "#f3b23a" : "#d9cfb8"
            }
            key={`${row}-${column}`}
            rx="5"
            ry="3"
            transform={`rotate(${row * 20 + column * 15} ${cx} ${cy})`}
          />
        );
      })
    )}
    <text
      fill="#d9cfb8"
      style={{ fontFamily: "var(--font-familjen), sans-serif" }}
      fontSize="24"
      fontWeight="600"
      letterSpacing="-0.5"
      textAnchor="middle"
      x="100"
      y="150"
    >
      seed library
    </text>
    <text
      fill="#f3b23a"
      style={{ fontFamily: "var(--font-geist-mono), monospace" }}
      fontSize="8"
      letterSpacing="2.5"
      textAnchor="middle"
      x="100"
      y="166"
    >
      BORROW · PLANT · RETURN
    </text>
  </svg>
);

/** A tee blank drawn flat in a garment colour, with the design on the chest. */
export const TeeMockup = ({
  art,
  colour,
  className,
}: {
  art: ReactNode;
  colour: string;
  className?: string;
}) => (
  <div className={cn("relative", className)}>
    <svg
      aria-hidden="true"
      className="size-full"
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M70 22c6 10 18 15 30 15s24-5 30-15l38 16 22 38-28 14-10-8v104H48V82l-10 8-28-14 22-38z"
        fill={colour}
        stroke="rgb(0 0 0 / 0.14)"
        strokeWidth="1.5"
      />
      <path
        d="M70 22c6 10 18 15 30 15s24-5 30-15"
        fill="none"
        stroke="rgb(0 0 0 / 0.2)"
        strokeWidth="2"
      />
    </svg>
    <div className="absolute start-[34%] top-[30%] w-[32%] overflow-hidden rounded-[2px]">
      {art}
    </div>
  </div>
);
