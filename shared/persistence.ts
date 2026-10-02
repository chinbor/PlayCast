import type {ChallengeState,ChallengeLibrarySave,ChallengeRules,RoomScope,NormalizerSave,OverlaySettings,MessageSettings} from './domain.js';
export interface ProductSave {
  challenge?: Partial<ChallengeState> | null;
  library?: ChallengeLibrarySave;
  historyDeletes?: string[];
  retiredMetricsVersion?: number;
  catalog?: unknown;
  overlaySettings?: Partial<OverlaySettings>;
  messageOverlaySettings?: Partial<MessageSettings>;
  setup?: {platformId?:string|null;confirmed?:RoomScope|null};
  room?: string;
  presets?: Record<string,Record<string,{target:number;rules:ChallengeRules}>>;
  normalizer?: NormalizerSave;
  normalizers?:Record<string,NormalizerSave|undefined>;
  version?:number;
}
export interface StorageStatus {pending:boolean;savedRevision:number;revision:number;error:{category:string;message:string}|null;commits:number;bytesWritten:number;blocked:boolean}
