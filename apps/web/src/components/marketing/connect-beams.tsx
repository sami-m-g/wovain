"use client";

import { AnimatedBeam } from "@wovain/ui/components/animated-beam";
import { useInView, useReducedMotion } from "motion/react";
import type { ReactNode, RefObject } from "react";
import { useRef } from "react";

import { ShuttleMark } from "@/components/brand/shuttle-mark";

interface Service {
  key: string;
  name: string;
  role: string;
  logo: ReactNode;
}

const BEAM_SECONDS = 3.2;
const BEAM_STAGGER = 0.6;
const CURVES = [-48, 0, 48] as const;

/** One account: its logo tile, and the beam that threads it into wovain. */
const Row = ({
  service,
  index,
  box,
  hub,
  moving,
}: {
  service: Service;
  index: number;
  box: RefObject<HTMLDivElement | null>;
  hub: RefObject<HTMLDivElement | null>;
  moving: boolean;
}) => {
  const tile = useRef<HTMLDivElement>(null);
  return (
    <div className="flex items-center gap-3">
      <div
        className="bg-card border-border shadow-raised relative z-10 flex h-14 w-28 shrink-0 items-center justify-center rounded-xl border px-3 sm:h-16 sm:w-32"
        ref={tile}
      >
        {service.logo}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold">{service.name}</span>
        <span className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
          {service.role}
        </span>
      </div>
      <AnimatedBeam
        containerRef={box}
        curvature={CURVES[index] ?? 0}
        delay={index * BEAM_STAGGER}
        duration={moving ? BEAM_SECONDS : 0}
        fromRef={tile}
        gradientStartColor="var(--primary)"
        gradientStopColor="var(--foreground)"
        // Remounting on entry restarts the beam; off screen it stops.
        key={String(moving)}
        pathColor="var(--border)"
        pathOpacity={1}
        pathWidth={1.5}
        repeat={moving ? Number.POSITIVE_INFINITY : 0}
        toRef={hub}
      />
    </div>
  );
};

/**
 * The three accounts a label connects, threaded into wovain with Magic UI's
 * animated beams. The beams run only while the diagram is on screen, and
 * hold still for visitors who ask for reduced motion.
 */
export const ConnectBeams = ({
  services,
}: {
  services: readonly [Service, Service, Service];
}) => {
  const box = useRef<HTMLDivElement>(null);
  const hub = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.4 });
  const reduced = useReducedMotion() ?? false;
  const moving = inView && !reduced;

  return (
    <div className="relative flex items-center justify-between gap-6" ref={box}>
      <div className="flex flex-col gap-6 sm:gap-8">
        {services.map((service, index) => (
          <Row
            box={box}
            hub={hub}
            index={index}
            key={service.key}
            moving={moving}
            service={service}
          />
        ))}
      </div>
      <div
        className="bg-card border-border shadow-floating relative z-10 grid size-20 shrink-0 place-items-center rounded-2xl border sm:size-24"
        ref={hub}
      >
        <ShuttleMark
          label={null}
          size={48}
          state={moving ? "intro" : "static"}
        />
      </div>
    </div>
  );
};
