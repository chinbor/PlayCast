import type {ProductSnapshot,ProductActionPayloads,OverlaySettings,MessageSettings,ChallengeRules,GiftRule,GiftCatalogSnapshot,MessageType,FeedRow,ProductQueryResults} from '../shared/domain'
import type {LiveTool,DisplayCommand,DisplayPayloads,WindowSnapshot,DisplayKind,AppearanceState,AppearanceMode} from '../shared/ipc'
export type Action = <K extends keyof ProductActionPayloads>(type:K,...args:undefined extends ProductActionPayloads[K]?[value?:ProductActionPayloads[K]]:[value:ProductActionPayloads[K]])=>Promise<ProductSnapshot|null>
export type Control = <C extends DisplayCommand>(command:C,...args:undefined extends DisplayPayloads[C]?[value?:DisplayPayloads[C]]:[value:DisplayPayloads[C]])=>Promise<WindowSnapshot|null|undefined>|void
export type MainControl = <C extends DisplayCommand>(kind:DisplayKind,command:C,...args:undefined extends DisplayPayloads[C]?[value?:DisplayPayloads[C]]:[value:DisplayPayloads[C]])=>Promise<WindowSnapshot|null>
export type QueryApi=Pick<LiveTool,'productQuery'|'getMainVisibility'|'onMainVisibility'>
export type QueryClient=QueryApi|null|undefined
export type LeaveGuard=(proceed:()=>void,cancel?:()=>void)=>void
export interface FeatureGuard {requestLeave:LeaveGuard}
export type GuardChange=(guard:LeaveGuard|null)=>void
export type FeatureKind='rules'|'display'|'connection'
export interface FeaturePanel {kind:FeatureKind;feature:'challenge'|'messages'|'game'}
export type RulesDraft=Omit<ChallengeRules,'likeEvery'|'follow'|'gifts'>&{likeEvery:number|string;follow:number|string;gifts:GiftDraft[]}
export type GiftDraft=Omit<GiftRule,'reward'>&{reward:number|string}
export type Presentation=OverlaySettings|MessageSettings
export type PresentationDraft=(Omit<OverlaySettings,'width'|'height'>&{width:number|string;height:number|string})|(Omit<MessageSettings,'width'|'height'>&{width:number|string;height:number|string})
export type ChallengePresentationDraft=Extract<PresentationDraft,{title:string}>
export type MessagePresentationDraft=Extract<PresentationDraft,{showOnline:boolean}>
export type CatalogView=Partial<GiftCatalogSnapshot>&{updatedAt?:number}
export type ViewSnapshot=Omit<ProductSnapshot,'giftCatalog'|'previewToken'>&{giftCatalog?:CatalogView;previewToken:string|number|null}
export interface ProductProps {s:ViewSnapshot;act:Action;busy?:boolean;preview?:boolean;onGuardChange?:GuardChange;refreshGifts?:()=>unknown;openAccount?:()=>void}
export type AppearanceView=Pick<AppearanceState,'mode'|'resolved'>&{saving?:boolean;error?:string}
export type AppearanceChange=(mode:AppearanceMode)=>unknown
export type FeedScope=number|string|null
export type DisplayRow=Omit<FeedRow,'id'|'userId'|'online'>&{id?:string;userId?:string;online?:number}
export type MessageFilter=MessageType|'all'
export interface Anchor {rowId?:number;offset:number}
export interface QueryState<K extends keyof ProductQueryResults>{data:ProductQueryResults[K]|null;loading:boolean;error:string}
export function errorMessage(error:unknown){return error instanceof Error?error.message:String(error)}
export function isProduct(value:WindowSnapshot):value is ProductSnapshot{return 'setup' in value&&'platform' in value}
export function isChallengePresentation(value:PresentationDraft):value is ChallengePresentationDraft{return 'title' in value}
export function isMessagePresentation(value:PresentationDraft):value is MessagePresentationDraft{return 'enabledTypes' in value}
