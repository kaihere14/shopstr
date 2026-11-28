import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function PageLoadingBar() {
  const router = useRouter();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  // router.events is one shared emitter, but the router object itself is
  // replaced on every navigation. Subscribing on [router] tore the listeners
  // down right after a fast navigation completed, cancelling the hide timer
  // and leaving the bar stuck part-way.
  const routerEvents = router.events;

  useEffect(() => {
    let timers: number[] = [];
    let progressTimer: number | null = null;

    const clearTimers = () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers = [];
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    };

    const schedule = (callback: () => void, delay: number) => {
      timers.push(window.setTimeout(callback, delay));
    };

    const start = () => {
      clearTimers();
      setFadeOut(false);
      setVisible(true);
      setWidth(0);

      // Quickly advance to ~15% then slowly crawl toward 85%
      schedule(() => setWidth(15), 50);
      schedule(() => setWidth(35), 200);
      schedule(() => setWidth(55), 500);

      // Slowly inch toward 85% to signal "still loading"
      let current = 55;
      progressTimer = window.setInterval(() => {
        if (current < 85) {
          current += Math.random() * 3;
          setWidth(Math.min(current, 85));
        }
      }, 400);
    };

    const done = () => {
      // Drop pending progress steps so they can't pull the bar back below 100%.
      clearTimers();
      setWidth(100);

      schedule(() => {
        setFadeOut(true);
        schedule(() => {
          setVisible(false);
          setWidth(0);
          setFadeOut(false);
        }, 300);
      }, 150);
    };

    routerEvents.on("routeChangeStart", start);
    routerEvents.on("routeChangeComplete", done);
    routerEvents.on("routeChangeError", done);

    return () => {
      routerEvents.off("routeChangeStart", start);
      routerEvents.off("routeChangeComplete", done);
      routerEvents.off("routeChangeError", done);
      clearTimers();
    };
  }, [routerEvents]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed top-0 right-0 left-0 z-[9999] h-[3px]"
      style={{
        opacity: fadeOut ? 0 : 1,
        transition: fadeOut ? "opacity 0.3s ease" : "none",
      }}
    >
      <div
        className="h-full bg-gradient-to-r from-orange-500 to-orange-400"
        style={{
          width: `${width}%`,
          boxShadow: "0 0 8px rgba(249, 115, 22, 0.7)",
          transition:
            width === 100
              ? "width 0.2s ease"
              : "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </div>
  );
}
