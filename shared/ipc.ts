import type { ProductSnapshot, ChallengeDisplaySnapshot, MessageDisplaySnapshot, DisplayOperations, OverlaySettings, MessageSettings, MessageType, CollectorSnapshot, FeedCursor, FeedRow, FeedSnapshot, ProductQueryOptions, ProductQueryResults, ProductActionPayloads } from './domain.js';

export type DisplayKind = 'challenge' | 'messages';
export type WindowKind = DisplayKind | 'challenge-settings' | 'messages-settings' | 'main';
export type AppearanceMode = 'system' | 'light' | 'dark';
export interface AppearanceState { mode: AppearanceMode; resolved: 'light' | 'dark'; revision: number }
export interface ResetState { active: boolean; error: string }
export interface ContextMetadata { preserveWorkspace?: boolean }
export interface CloseRequest { id: number; kind?: WindowKind; reason?: string; contextVersion: number }
export interface SettingsSnapshot { contextVersion: number; visible: boolean; presentation: OverlaySettings | MessageSettings; capabilities: MessageType[]; displayKind: DisplayKind; section: string; operations?: DisplayOperations & { locked: boolean; roomBusy: boolean } }
export type WindowSnapshot = ProductSnapshot | ChallengeDisplaySnapshot | MessageDisplaySnapshot | SettingsSnapshot;
export type DisplayCommand = 'lock' | 'close' | 'settings-open' | 'settings-close' | 'preview' | 'settings' | 'section' | 'room-connect' | 'room-disconnect' | 'challenge-start' | 'challenge-pause';
export interface DisplayPayloads {
  lock: boolean;
  close: null | undefined;
  'settings-open': 'live' | 'game' | 'appearance' | null | undefined;
  'settings-close': null | undefined;
  preview: null | undefined;
  settings: Partial<OverlaySettings> | Partial<MessageSettings>;
  section: 'live' | 'game' | 'appearance';
  'room-connect': { room: string };
  'room-disconnect': null | undefined;
  'challenge-start': { id: string };
  'challenge-pause': { id: string };
}
export type DisplayFeed = Omit<FeedSnapshot, 'messages'> & { messages: Omit<FeedRow, 'id' | 'userId' | 'online'>[]; contextVersion: number };
export type Unsubscribe = () => void;

/** The preload exposes only these operations, never Electron or Node handles. */
export interface LiveTool {
  initialAppearance: AppearanceState | null;
  getAppearance(): Promise<AppearanceState>;
  setAppearance(mode: AppearanceMode): Promise<AppearanceState>;
  onAppearance(callback: (state: AppearanceState) => void): Unsubscribe;
  getResetState(): Promise<ResetState>;
  onResetState(callback: (state: ResetState) => void): Unsubscribe;
  getMainVisibility(): Promise<boolean>;
  onMainVisibility(callback: (visible: boolean) => void): Unsubscribe;
  getProduct(): Promise<WindowSnapshot>;
  productQuery<K extends keyof ProductQueryResults>(type: K, options?: ProductQueryOptions[K], contextVersion?: number): Promise<ProductQueryResults[K]>;
  subscribeGameData(active: boolean, contextVersion?: number): Promise<boolean>;
  action<K extends keyof ProductActionPayloads>(type: K, ...args: undefined extends ProductActionPayloads[K] ? [value?: ProductActionPayloads[K]] : [value: ProductActionPayloads[K]]): Promise<ProductSnapshot>;
  displayControl<C extends DisplayCommand>(kind: DisplayKind, command: C, ...args: undefined extends DisplayPayloads[C] ? [value?: DisplayPayloads[C], contextVersion?: number] : [value: DisplayPayloads[C], contextVersion?: number]): Promise<WindowSnapshot>;
  setDisplayCloseGuard(kind: WindowKind, enabled: boolean, contextVersion: number): Promise<boolean>;
  setMainCloseGuard(enabled: boolean, contextVersion: number): Promise<boolean>;
  answerMainClose(id: number, approved: boolean, contextVersion: number): Promise<boolean>;
  answerDisplayClose(kind: WindowKind, id: number, approved: boolean, contextVersion: number): Promise<boolean>;
  onDisplayCloseRequest(callback: (request: CloseRequest) => void): Unsubscribe;
  onDisplayCloseComplete(callback: (request: CloseRequest) => void): Unsubscribe;
  displayFeed(cursor: FeedCursor, contextVersion: number): Promise<DisplayFeed>;
  getGame(): Promise<CollectorSnapshot>;
  onProduct(callback: (state: WindowSnapshot) => void): Unsubscribe;
  onContextChange(callback: (version: number, metadata?: ContextMetadata) => void): Unsubscribe;
  onCorrection(callback: () => void): Unsubscribe;
  onError(callback: (message: string) => void): Unsubscribe;
  subscribe(callback: (snapshot: CollectorSnapshot) => void): Unsubscribe;
}
