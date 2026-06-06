import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return this.props.fallback || (
        <div className="p-4 text-red-400 text-sm border border-red-800 rounded m-2">
          <div className="font-medium mb-1">组件错误</div>
          <div className="text-xs text-red-500">{this.state.error.message}</div>
          <button onClick={() => this.setState({ error: null })} className="mt-2 text-xs bg-red-900/50 hover:bg-red-900 px-3 py-1 rounded transition-colors">重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}
