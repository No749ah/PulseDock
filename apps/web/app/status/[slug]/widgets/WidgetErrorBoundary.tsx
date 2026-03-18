"use client";

import { Component, type ReactNode } from "react";

interface Props {
  widgetType: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center rounded-xl border border-border/50 bg-surface/30 p-4 text-center">
          <p className="text-xs text-text-secondary">
            Widget failed to render
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
