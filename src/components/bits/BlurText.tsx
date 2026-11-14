/**
 * BlurText — word/letter blur-and-rise stagger.
 * Adapted from ReactBits (github.com/DavidHDev/react-bits, MIT) — compact TS port.
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props {
  text: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
  className?: string;
  animateBy?: 'words' | 'letters';
  delay?: number;         // base ms
  stepMs?: number;        // per-piece stagger
  once?: boolean;
  style?: React.CSSProperties;
  onAnimationComplete?: () => void;
}

export function BlurText({
  text, as = 'span', className, animateBy = 'words', delay = 80, stepMs = 90, once = true, style, onAnimationComplete,
}: Props) {
  const parts = useMemo(
    () => (animateBy === 'letters' ? text.split('') : text.split(' ')),
    [text, animateBy],
  );
  const Tag = motion[as] as typeof motion.span;
  return (
    <Tag className={className} style={{ display: 'inline-block', ...style }} aria-label={text}>
      {parts.map((p, i) => (
        <motion.span
          key={`${p}-${i}`}
          initial={{ opacity: 0, filter: 'blur(10px)', y: 18 }}
          whileInView={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          viewport={{ once, amount: 0.6 }}
          transition={{ delay: (delay + i * stepMs) / 1000, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: 'inline-block', willChange: 'transform, filter, opacity' }}
          onAnimationComplete={i === parts.length - 1 ? onAnimationComplete : undefined}
        >
          {p}
          {animateBy === 'words' && i < parts.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </Tag>
  );
}

/** ShinyText — moving sheen across text. Adapted from ReactBits (MIT). */
export function ShinyText({ text, shineDelay = 3.5, className, style }: { text: string; shineDelay?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <>
      <style>{`.rb-shiny{position:relative;display:inline-block}.rb-shiny::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.55) 48%,rgba(255,255,255,.85) 50%,rgba(255,255,255,.55) 52%,transparent 60%);background-size:220% 100%;background-position:120% 0;mix-blend-mode:screen;animation:rb-shine ${shineDelay}s ease-in-out infinite;pointer-events:none;border-radius:inherit}@keyframes rb-shine{0%,62%{background-position:120% 0}80%,100%{background-position:-120% 0}}`}</style>
      <span className={`rb-shiny ${className ?? ''}`} style={style}>{text}</span>
    </>
  );
}

/** GradientText — animated gradient headline text. Adapted from ReactBits (MIT). */
export function GradientText({
  children, colors = ['#5aa2ff', '#8a5cff', '#22d3ee', '#5aa2ff'], className, style, speed = 4,
}: { children: ReactNode; colors?: string[]; className?: string; style?: React.CSSProperties; speed?: number }) {
  return (
    <span
      className={className}
      style={{
        backgroundImage: `linear-gradient(90deg, ${colors.join(', ')})`,
        backgroundSize: '300% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        animation: `rb-gradient ${speed}s linear infinite`,
        ...style,
      }}
    >
      <style>{`@keyframes rb-gradient{to{background-position:300% 0}}`}</style>
      {children}
    </span>
  );
}
