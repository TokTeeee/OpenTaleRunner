import { LeftPanel } from './LeftPanel';
import { CenterPanel } from './CenterPanel';
import { RightPanel } from './RightPanel';

interface Props {
  onAutoPlayStart: () => void;
  onAutoPlayPause: () => void;
  onAutoPlayStop: () => void;
  onAutoPlayStep: () => void;
}

export function AppLayout({ onAutoPlayStart, onAutoPlayPause, onAutoPlayStop, onAutoPlayStep }: Props) {
  return (
    <div className="h-screen w-screen flex bg-ambient relative overflow-hidden">
      <div className="stars" />
      <div className="relative z-10 flex w-full">
        <LeftPanel />
        <CenterPanel />
        <RightPanel
          onAutoPlayStart={onAutoPlayStart}
          onAutoPlayPause={onAutoPlayPause}
          onAutoPlayStop={onAutoPlayStop}
          onAutoPlayStep={onAutoPlayStep}
        />
      </div>
    </div>
  );
}
