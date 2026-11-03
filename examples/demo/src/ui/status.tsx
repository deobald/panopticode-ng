// Parse-only TSX fixture; Panopticode does not require a UI framework to analyze it.
declare namespace JSX {
  interface IntrinsicElements { span: { children?: unknown; className?: string } }
}

export const Status = ({ busy, error }: { busy: boolean; error?: string }) => {
  if (error) return <span className="error">{error}</span>;
  return <span>{busy ? 'Sending…' : 'Ready'}</span>;
};

export const formatReference = (reference: string) => reference.trim().toUpperCase();
