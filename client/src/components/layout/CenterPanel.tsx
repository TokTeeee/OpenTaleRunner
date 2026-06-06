import { NarrativeArea } from '../game/NarrativeArea';
import { InteractionArea } from '../game/InteractionArea';

export function CenterPanel() {
  return (
    <div className="flex-1 flex flex-col min-w-0 z-10">
      <NarrativeArea />
      <InteractionArea />
    </div>
  );
}
