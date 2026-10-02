/** Type-only contracts shared by Electron and the renderer. */
export type Source = 'live' | 'test';
export interface CollectorSnapshot {status:string;mode:string;message?:string;data?:GameData;updatedAt?:number;requestMs?:number;intervalMs?:number;contextVersion?:number}
export type MessageType = 'comment' | 'like' | 'enter' | 'follow' | 'gift';
export type MetricId = 'champion-kills' | 'turret-kills' | 'baron-kills' | 'dragon-kills' | 'herald-kills';
export type ModeGroup = 'classic' | 'aram';
export type ChallengeStatus = 'idle' | 'paused' | 'running' | 'ended';
export interface AccountOwner { platformId: string; accountScope: string }
export interface RoomScope extends AccountOwner { roomId: string; scope?: undefined }
export interface AccountBinding extends AccountOwner { scope: 'account'; roomId?: undefined }
export type ChallengeBinding = RoomScope | AccountBinding;
export interface AccountProfile { id: string; displayId: string; nickname: string; signature: string; avatar: string; followerCount: number | null; followingCount: number | null }
export interface AccountState { status: string; profile: AccountProfile | null; configured: boolean; message?: string; checked?:boolean; busy?:boolean; refreshing?:boolean; loginOpen?:boolean; persistenceMessage?:string; verifiedAt?:number }
export interface GiftRule { platformId: string; giftId: string; name: string; icon: string | null; reward: number }
export interface ChallengeRules { likesEnabled: boolean; likeEvery: number; followEnabled: boolean; follow: number; commentsEnabled: boolean; commentKeywords: string[]; gifts: GiftRule[] }
export interface InteractionEvent extends Partial<AccountOwner> { roomId?:string; scope?:'account'; id: string; type: MessageType; count: number; userId?: string; userName?: string; giftId?: string; giftName?: string; text?: string; icon?: string | null; online?: number; combo?: boolean; groupId?: string; repeatEnd?: boolean; receivedAt?: number }
export interface RawInteractionEvent extends Omit<InteractionEvent,'count'|'repeatEnd'> {count?:number;repeatEnd?:boolean|number;createdAt?:number;price?:number}
export interface NormalizedEvent extends InteractionEvent { platformId: string; accountScope: string; roomId: string; receivedAt: number }
export interface NormalizerSave { version: number; seen: string[]; combos: [string, number][] }
export interface GamePlayer { riotId?: string; summonerName?: string; riotIdGameName?: string; championName?: string; team?: string; scores?: { kills?: number; deaths?: number; assists?: number; creepScore?: number } }
export interface GameEvent { EventID: string | number; EventName: string; EventTime: number; KillerName?: string; VictimName?: string; Assisters?: string[]; TurretKilled?: string }
export interface GameData { activePlayer?: GamePlayer; allPlayers: GamePlayer[]; gameData: { gameTime: number; gameMode?: string; mapNumber?: number; mapName?: string }; events?: { Events: GameEvent[] }; gameSession?: { gameMode: string; mapId: number; queueId: number; gameId?: string } }
export interface ResolvedGameMode { id: string; group: ModeGroup | null; label: string; matchId: string | null }
export interface MetricDescriptor { id: MetricId; label: string; scope: 'player' | 'team'; protocolVerified: boolean; liveVerified: boolean }
export interface MetricResult { status: string; message: string; value: number | null; identity: string | null; time: number | null; champion: string | null; team: string | null; mode: ResolvedGameMode }
export interface ChallengeStats { likes: number; follows: number; comments: number; gifts: number }
export type Contributions = Record<'like' | 'follow' | 'comment' | 'gift', number>;
export interface ChallengeLog { id?: string; at: number; kind: string; text: string; delta: number }
export interface ChallengeGameBaseline { identity: string; time: number; value: number; at: number; matchId?: string | null; champion?: string | null; team?: string | null }
export interface ChallengeState { version: number; id: string; status: ChallengeStatus; configured: boolean; modeGroup: ModeGroup; metricId: MetricId; metricStatus: string; metricMessage: string; binding: ChallengeBinding | null; migrationNotice: string | null; target: number; auto: number; adjustment: number; pending: number; rules: ChallengeRules; stats: ChallengeStats; contributions: Contributions; contributionsComplete: boolean; createdAt: number | null; startedAt: number | null; endedAt: number | null; celebratedAt: number | null; likeBalance: number; seen: string[]; followed: string[]; game: ChallengeGameBaseline | null; needsBaseline: boolean; logs: ChallengeLog[] }
export interface AttributionChange { id: number; at: number; delta: number; kind: string; text: string; icon: string | null; merged: boolean }
export interface AttributionChanges { target: AttributionChange | null; progress: AttributionChange | null }
export interface OverlaySettings { theme: string; title: string; pure: boolean; alwaysOnTop: boolean; animations: boolean; layoutVersion: number; backgroundTransparency: number; width: number; height: number }
export interface MessageSettings { theme: 'dark'; backgroundTransparency: number; width: number; height: number; alwaysOnTop: boolean; pure: boolean; showOnline: boolean; enabledTypes: MessageType[] }
export interface FeedRow { id: string; type: MessageType; userId: string; userName: string; text: string; giftName: string; icon: string | null; count: number; online: number; rowId: number; receivedAt: number }
export type MessageCounts = Record<MessageType, number>;
export interface FeedCursor { generation?: string; after?: number }
export interface FeedSnapshot { generation: string; reset: boolean; messages: FeedRow[]; counts: MessageCounts; total: number; after: number; limit: number; perTypeLimit: number; retainedCounts: MessageCounts; retainedBytes: MessageCounts; retainedIds: number[]; cleared: boolean }
export interface HistorySummary { id: string; modeGroup?: ModeGroup; metricId: string; metric?: MetricDescriptor; binding: ChallengeBinding; createdAt?: number | null; startedAt?: number | null; endedAt?: number | null; result: 'completed' | 'ended-early'; target: number; completed: number }
export interface HistoryRules extends Omit<ChallengeRules,'commentsEnabled'|'commentKeywords'|'gifts'> {commentsEnabled?:boolean;commentKeywords?:string[];gifts:(Omit<GiftRule,'icon'>&{icon?:string|null})[]}
export interface HistoryLog {id?:string;at?:number;kind?:string;text:string;delta?:number}
export interface HistoryRecord extends HistorySummary { rules: HistoryRules; stats: ChallengeStats; contributions?: Contributions; contributionsComplete?: boolean; auto?: number; adjustment?: number; pending?: number; logs: HistoryLog[] }
export interface HistoryOptions { page?: number; modeGroup?: ModeGroup; metricId?: MetricId; result?: HistorySummary['result'] }
export interface HistoryPage { items: HistorySummary[]; page: number; pageSize: number; total: number; completedCount: number }
export interface ChallengeLibrarySave { drafts: ChallengeState[]; history: (HistorySummary | HistoryRecord)[] }
export interface ChallengeSnapshot extends Omit<ChallengeState,'seen'|'followed'|'needsBaseline'|'logs'|'game'> {logs?:ChallengeLog[];game?:ChallengeGameBaseline|null;completed:number;remaining:number;metric:MetricDescriptor|undefined;changes:AttributionChanges}
export interface PlatformDescriptor { id: string; name: string; capabilities: { login: string[]; messages: MessageType[]; giftCatalog: boolean } }
export interface GiftItem {platformId:string;giftId:string;name:string;icon:string;price:number|null;currency:string|null;source?:string;observedRoomId?:string}
export interface GiftCatalogSnapshot {items:GiftItem[];status:string;scope?:AccountBinding|RoomScope|null;message?:string;loading?:boolean;version?:number}
export interface StorageState {pending:boolean;error:{category:string;message:string}|null;blocked?:boolean;savedRevision?:number;revision?:number;commits?:number;bytesWritten?:number}
export interface StorageUsage extends StorageState {categories:{hot:number;history:number;cache:number;recovery:number};total:number}
export interface ChallengeSlot {id:string;modeGroup:ModeGroup;metricId:MetricId;status:ChallengeStatus;target:number;completed:number;binding?:ChallengeBinding}
export interface SetupState {stage:string;complete:boolean;platformId:string|null;roomConfirmed?:boolean;preparing?:boolean;preparingRoom?:string;workspaceAvailable?:boolean;requiresNewChallenge?:boolean}
export interface PlatformState {status:string;message?:string;room?:string;liveStatus?:string;online?:number|null;viewers?:number;roomId?:string;nickname?:string;title?:string;received?:number;decoded?:number;errors?:number;unsupported?:number;ignored?:number;frameErrors?:number;processingErrors?:number;giftReceived?:number;giftDecoded?:number;giftErrors?:number;lastMessageAt?:number|null;extensionVersion?:number;extensionReceived?:number;auth?:AccountState}
export interface RuleRow {id:string;kind:string;label:string;reward:number;icon?:string|null}
export interface InteractionWarning {code:string;message:string;count:number;at:number}
export interface ProductSnapshot extends ChallengeSnapshot {
 interactionWarning:InteractionWarning|null;overlaySettings:OverlaySettings;messageOverlaySettings:MessageSettings;
 displayWindows:{challenge:{open:boolean;locked:boolean};messages:{open:boolean;locked:boolean}};overlayRules:RuleRow[];previewToken:string|null;
 contextVersion:number;collector:CollectorSnapshot;source:Source;scope:RoomScope|null;historyVersion:number;giftVersion:number;feedVersion:string;storage:StorageState;room:string;persistenceError:string;
 challengeSlots:ChallengeSlot[];history?:(HistorySummary|HistoryRecord|null|undefined)[];douyin:PlatformState;platform:PlatformDescriptor;platforms:PlatformDescriptor[];account:AccountState;debugAvailable:boolean;setup:SetupState;
 modeGroups:readonly {id:string;label:string;description:string;metricIds:readonly string[]}[];gameMode:ResolvedGameMode;metrics:(MetricDescriptor&MetricResult)[];
 rulePresets:Record<string,{target:number;rules:ChallengeRules}>;giftCatalog?:GiftCatalogSnapshot;feed?:FeedSnapshot;shortcuts:{key:string;label:string;registered:boolean}[];giftLoading:boolean;logsVersion:string|null;
}
export interface DisplayOperations {available:boolean;source?:string;challenge:{id?:string;status:string;configured:boolean;canStart:boolean;canPause:boolean}|null;room:{id:string;status:string;platform:string};game:{status:string;identity:string;mode?:string;message?:string;value?:number|null;metric?:string;intervalMs?:number|null;requestMs?:number|null;updatedAt?:number|null}}
export interface ChallengeDisplaySnapshot {displayKind:'challenge';locked:boolean;visible:boolean;source:Source;contextVersion:number;account:{status:string};presentation:OverlaySettings;ruleRows:RuleRow[];changes:AttributionChanges;previewToken:string|null;completed:number;target:number;id?:string;status?:ChallengeStatus;configured?:boolean;modeGroup?:ModeGroup;gameMode?:ResolvedGameMode;metricStatus?:string;metricId?:MetricId;metric?:MetricDescriptor;pending?:number;celebratedAt?:number|null;operations?:DisplayOperations}
export interface MessageDisplaySnapshot {displayKind:'messages';source:Source;locked:boolean;visible:boolean;contextVersion:number;presentation:MessageSettings;feedVersion:string;online:number|null;connectionStatus:string;capabilities:MessageType[]}
export interface DiagnosticEntry {method:string;stage:string;code:string;timestamp:number;payloadSize:number}
export interface UnsupportedSummary {items:{method:string;count:number}[];otherCount:number;total:number;limit:number}
export interface DiagnosticQuery {items:DiagnosticEntry[];scope:Partial<RoomScope>|null;limit:number;unsupported:UnsupportedSummary}
export interface ExtensionEvent {type:'extension';method:string;label:string;category:string;level:string;summary:string;userName:string;userId:string;fields:{label:string;value:string}[];notice:string}
export interface ExtensionSample {method:string;receivedAt:number;payloadSize:number;preview:{field:number;values:({wire:'varint';value:string}|{wire:'bytes';length:number})[]}[]}
export interface ExtensionQuery {items:(ExtensionEvent&{count:number;receivedAt:number})[];samples:ExtensionSample[];sampling:boolean;scope:Partial<RoomScope>|null;supported:boolean;expiresAt?:number;bytes?:number;version?:number;limit?:number;sampleLimit?:number;byteLimit?:number}
export interface ChallengeLogQuery {items:ChallengeLog[];challengeId:string|null;scope:ChallengeBinding|null;version:string|null;limit:number}
export interface ProductQueryResults {challengeLog:ChallengeLogQuery;extensions:ExtensionQuery;diagnostics:DiagnosticQuery;history:HistoryPage&{version:number};historyDetail:HistoryRecord|HistorySummary|null;feed:FeedSnapshot;gifts:GiftCatalogSnapshot;storage:StorageUsage}
export interface ProductQueryOptions {challengeLog:undefined;extensions:undefined;diagnostics:undefined;history:HistoryOptions;historyDetail:{id:string};feed:FeedCursor;gifts:undefined;storage:undefined}
export interface ConfigureChallenge {metricId:MetricId;modeGroup?:ModeGroup;target:number;rules:ChallengeRules}
export interface ProductActionPayloads {
 overlayClose:undefined;messageOverlayClose:undefined;overlayPreview:undefined;overlaySettings:Partial<OverlaySettings>;messageOverlaySettings:Partial<MessageSettings>;
 extensionSampling:boolean;clearExtensions:undefined;source:Source;selectPlatform:string;confirmRoom:string;connect:string;disconnect:undefined;refreshGifts:undefined;
 bindLegacy:undefined;chooseGameplay:undefined;resumeChallenge:string;configureChallenge:ConfigureChallenge;login:string|undefined;credential:string;importAndVerify:string;clearCredential:undefined;logout:undefined;refreshAuth:undefined;
 overlay:undefined;messageOverlay:undefined;deleteHistory:string;clearFeed:undefined;clearCaches:undefined;simulate:MessageType|'batch';resetTest:undefined;
 start:undefined;pause:undefined;end:undefined;finish:undefined;rules:ChallengeRules;target:number;targetDelta:number;completed:number;completeDelta:number;pending:undefined;undoPending:undefined;rebase:undefined;
 factoryReset:{confirmation:string;contextVersion:number};
}
export type ProductAction={ [K in keyof ProductActionPayloads]:{type:K;value:ProductActionPayloads[K]} }[keyof ProductActionPayloads];
export type ProductQuery={ [K in keyof ProductQueryOptions]:{type:K;options:ProductQueryOptions[K]} }[keyof ProductQueryOptions];
