import './styles'
import App from '../App'
import ResetBoundary from '../components/ResetBoundary'
import type {LiveTool} from '../../shared/ipc'
export default function Workspace({api,preview=false}:{api:LiveTool|undefined;preview?:boolean}){return <ResetBoundary api={api}><App api={api} preview={preview}/></ResetBoundary>}
