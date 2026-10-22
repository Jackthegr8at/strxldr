import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import type { StakersChart as Chart } from './StakersChart';
const StakersChart = lazy(() => import('./StakersChart').then(module => ({ default: module.StakersChart })));
export function DeferredStakersChart(props: ComponentProps<typeof Chart>) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [eligible, setEligible] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') { setEligible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setEligible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    if (wrapper.current) observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={wrapper} data-testid="deferred-stakers-chart" style={{ minHeight: 300 }}>
    {eligible ? <Suspense fallback={<div style={{ height: 300 }} aria-label="Loading distribution chart" />}><StakersChart {...props} /></Suspense> : <div style={{ height: 300 }} aria-label="Distribution chart loads when nearby" />}
  </div>;
}
