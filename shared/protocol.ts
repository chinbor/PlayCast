import type {InteractionEvent} from './domain.js';
export interface Fixed32 {wire:5;float:number}
export type WireValue=bigint|Buffer|Fixed32;
export type WireFields=Map<number,WireValue[]>;
export type DecodeFields=(input:Uint8Array|string,options?:{fixed32?:boolean})=>WireFields;
export interface WireMessage {method:string;payload?:Buffer;id:string}
export interface ExtensionEvent {type:'extension';method:string;label:string;category:string;level:string;summary:string;userName:string;userId:string;fields:{label:string;value:string}[];notice:string}
export interface RoomEvent {type:'room';online:number;viewers:number}
export interface ControlEvent {type:'control';status:number}
export type ProtocolEvent=(Omit<Partial<InteractionEvent>,'repeatEnd'>&{id:string;type:InteractionEvent['type'];createdAt:number;price?:number;repeatEnd?:boolean|number})|RoomEvent|ControlEvent|ExtensionEvent;
