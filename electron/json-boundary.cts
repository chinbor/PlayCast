/** Only external object inspection uses a property bag; domain state stays explicit. */
function isObject(value:unknown):value is Record<string,unknown>{
  return !!value&&typeof value==='object'&&!Array.isArray(value)
}
function asObject(value:unknown):Record<string,unknown>{return isObject(value)?value:{}}
function first(value:unknown):unknown{return Array.isArray(value)?(value as unknown[])[0]:undefined}
export {isObject,asObject,first}
