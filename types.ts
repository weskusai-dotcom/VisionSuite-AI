
export interface HistoryState {
  resultImage?: string;
  tags?: string[];
  caption?: string;
}

export interface ImageFile {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  subStatus?: string;
  progress: number;
  resultImage?: string;
  tags?: string[];
  caption?: string;
  error?: string;
  history: HistoryState[];
  historyIndex: number;
}

export enum ProcessingMode {
  BACKGROUND_REMOVAL = 'bg-removal',
  TAGGING = 'tagging',
  CAPTIONING = 'captioning',
  FULL_SUITE = 'full-suite'
}

export type OutputQuality = 'low' | 'medium' | 'high';
export type BgColor = 'transparent' | 'white' | 'black' | 'green';
