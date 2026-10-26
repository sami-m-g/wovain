'use client'

// React Imports
import { useEffect, useRef, useState, type ReactNode } from 'react'

// Third-party Imports
import { type MotionValue, motion, useScroll, useSpring, useTransform } from 'motion/react'

// Util Imports
import { cn } from '@wovain/ui/lib/utils'

export interface TimelineAnimateEntry {
  index: string
  content: ReactNode
}

interface TimelineAnimateProps {
  data: TimelineAnimateEntry[]
  className?: string
}

// How much higher the content sits compared to its index marker, in pixels
const CONTENT_LIFT = 10
const LINE_GAP = 28

type Segment = { start: number; end: number }

type TimelineAnimateRowProps = TimelineAnimateEntry & {
  isLast: boolean
  rowRef: (node: HTMLDivElement | null) => void
  indexRef: (node: HTMLDivElement | null) => void
}

const TimelineAnimateRow = ({ index, content, isLast, rowRef, indexRef }: TimelineAnimateRowProps) => {
  const localRowRef = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: localRowRef,
    offset: ['start 70%', 'start 45%']
  })

  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 20, mass: 0.5 })
  const opacity = useTransform(progress, [0, 1], [0, 1])
  const y = useTransform(progress, [0, 1], [32, 0])
  const contentY = useTransform(progress, [0, 1], [32 - CONTENT_LIFT, -CONTENT_LIFT])

  return (
    <div
      ref={node => {
        localRowRef.current = node
        rowRef(node)
      }}
      className={cn('relative', !isLast && 'pb-10 sm:pb-16')}
    >
      <motion.div
        ref={indexRef}
        style={{ opacity, y }}
        className='text-muted-foreground absolute left-7 w-fit -translate-x-1/2 px-1 text-center text-lg font-semibold sm:left-9 sm:text-xl'
      >
        {index}
      </motion.div>
      <motion.div style={{ opacity, y: contentY }} className='min-w-0 pl-16 sm:pl-20'>
        {content}
      </motion.div>
    </div>
  )
}

const TimelineAnimateSegment = ({
  start,
  end,
  revealed
}: {
  start: number
  end: number
  revealed: MotionValue<number>
}) => {
  const height = useTransform(revealed, value => Math.min(Math.max(value - start, 0), end - start))

  return (
    <div
      style={{ top: start, height: end - start }}
      className='absolute left-7 w-0.5 -translate-x-1/2 overflow-hidden bg-transparent sm:left-9'
    >
      <motion.div style={{ height }} className='bg-border absolute inset-x-0 top-0 w-0.5 rounded-full' />
    </div>
  )
}

const TimelineAnimate = ({ data, className }: TimelineAnimateProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const rowNodes = useRef<Array<HTMLDivElement | null>>([])
  const indexNodes = useRef<Array<HTMLDivElement | null>>([])
  const [segments, setSegments] = useState<Segment[]>([])

  useEffect(() => {
    if (!contentRef.current) return

    const measure = () => {
      const containerTop = contentRef.current!.getBoundingClientRect().top

      const bounds = rowNodes.current
        .map((rowNode, nodeIndex) => (rowNode ? { rowNode, indexNode: indexNodes.current[nodeIndex] } : null))
        .filter((entry): entry is { rowNode: HTMLDivElement; indexNode: HTMLDivElement } => !!entry?.indexNode)
        .map(({ rowNode, indexNode }) => {
          const top = rowNode.getBoundingClientRect().top - containerTop
          const height = indexNode.getBoundingClientRect().height

          return { top, bottom: top + height }
        })

      if (!bounds.length) return

      let cursor = 0
      const nextSegments: Segment[] = []

      bounds.forEach(bound => {
        nextSegments.push({ start: cursor, end: Math.max(cursor, bound.top - LINE_GAP) })
        cursor = bound.bottom + LINE_GAP
      })

      setSegments(nextSegments)
    }

    measure()

    const observer = new ResizeObserver(measure)

    observer.observe(contentRef.current)

    return () => observer.disconnect()
  }, [data.length])

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 80%', 'end 60%']
  })

  const totalHeight = segments.at(-1)?.end ?? 0
  const revealed = useTransform(scrollYProgress, [0, 1], [0, totalHeight])

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div ref={contentRef} className='relative'>
        <div className='h-16 sm:h-30' />

        {data.map((item, itemIndex) => (
          <TimelineAnimateRow
            key={itemIndex}
            {...item}
            isLast={itemIndex === data.length - 1}
            rowRef={node => (rowNodes.current[itemIndex] = node)}
            indexRef={node => (indexNodes.current[itemIndex] = node)}
          />
        ))}

        {segments.map((segment, segmentIndex) => (
          <TimelineAnimateSegment key={segmentIndex} start={segment.start} end={segment.end} revealed={revealed} />
        ))}
      </div>
    </div>
  )
}

export { TimelineAnimate }
