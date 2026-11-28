import { act, render } from "@testing-library/react";
import { useRouter } from "next/router";

import PageLoadingBar from "../page-loading-bar";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

type Handler = () => void;

function createRouterEvents() {
  const handlers = new Map<string, Set<Handler>>();
  return {
    on: (event: string, handler: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off: (event: string, handler: Handler) => {
      handlers.get(event)?.delete(handler);
    },
    emit: (event: string) => {
      handlers.get(event)?.forEach((handler) => handler());
    },
  };
}

const mockUseRouter = useRouter as jest.Mock;

describe("PageLoadingBar", () => {
  let events: ReturnType<typeof createRouterEvents>;

  beforeEach(() => {
    jest.useFakeTimers();
    events = createRouterEvents();
    // Next.js hands out a fresh router object on every route change while
    // router.events stays the same emitter.
    mockUseRouter.mockImplementation(() => ({ events }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const getBar = (container: HTMLElement) =>
    container.querySelector<HTMLElement>(".fixed");

  test("shows while a route loads and hides once it completes", () => {
    const { container } = render(<PageLoadingBar />);
    expect(getBar(container)).toBeNull();

    act(() => events.emit("routeChangeStart"));
    expect(getBar(container)).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(1000);
      events.emit("routeChangeComplete");
      jest.advanceTimersByTime(1000);
    });
    expect(getBar(container)).toBeNull();
  });

  test("hides after a fast navigation even when the router object changes after completion", () => {
    const { container, rerender } = render(<PageLoadingBar />);

    act(() => events.emit("routeChangeStart"));
    act(() => {
      jest.advanceTimersByTime(100);
      events.emit("routeChangeComplete");
    });

    // The new page's render hands out a new router object after the
    // completion event has already fired.
    rerender(<PageLoadingBar />);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(getBar(container)).toBeNull();
  });

  test("does not jump back to partial progress after a fast navigation completes", () => {
    const { container } = render(<PageLoadingBar />);

    act(() => events.emit("routeChangeStart"));
    act(() => {
      jest.advanceTimersByTime(100);
      events.emit("routeChangeComplete");
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });

    const bar = getBar(container);
    if (bar) {
      expect(bar.firstElementChild).toHaveStyle({ width: "100%" });
    }
  });
});
