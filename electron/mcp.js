const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

function validateServer(input) {
  if (!input || !/^[a-zA-Z0-9_-]{1,48}$/.test(input.name || '')) throw new Error('Server name must contain 1–48 letters, numbers, underscores or hyphens.');
  const value = { name: input.name, enabled: input.enabled !== false };
  if (input.url) {
    const url = new URL(input.url);
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Use HTTPS, or HTTP on localhost.');
    value.url = url.href;
    if (input.bearerTokenEnvVar) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.bearerTokenEnvVar)) throw new Error('Invalid bearer token environment variable.');
      value.bearerTokenEnvVar = input.bearerTokenEnvVar;
    }
  } else {
    if (typeof input.command !== 'string' || !input.command.trim()) throw new Error('Provide a command or an HTTP URL.');
    if (input.args && (!Array.isArray(input.args) || input.args.some(x => typeof x !== 'string'))) throw new Error('Arguments must be a JSON array of strings.');
    if (input.env && (typeof input.env !== 'object' || Array.isArray(input.env) || Object.values(input.env).some(x => typeof x !== 'string'))) throw new Error('Environment must be an object of strings.');
    if (input.cwd !== undefined) { if (typeof input.cwd !== 'string' || !require('node:path').isAbsolute(input.cwd)) throw new Error('MCP working directory must be absolute.'); value.cwd = input.cwd; }
    value.command = input.command.trim(); value.args = input.args || []; value.env = input.env || {};
  }
  return value;
}

function createMcpManager(configPath) {
  const routes = new Map();
  const connected = new Map(), connecting = new Map(), states = new Map();
  let servers = null;
  const read = async () => { if (!servers) { try { servers = (JSON.parse(await fs.readFile(configPath, 'utf8'))).map(validateServer); } catch (e) { if (e.code !== 'ENOENT') throw e; servers = []; } } return servers; };
  const disconnect = async name => { const pending = connecting.get(name); if (pending) { try { await pending; } catch {} } const item=connected.get(name);connected.delete(name);if(item)await item.client.close();states.set(name,{status:'disconnected'}); };
  async function connect(name) {
    if (connected.has(name)) return connected.get(name);
    if (connecting.has(name)) return connecting.get(name);
    const promise = (async()=>{
      const config=(await read()).find(s=>s.name===name && s.enabled);if(!config)throw new Error('MCP server is disabled or missing.');
      const client=new Client({name:'vendracode',version:'1.3.0'},{capabilities:{}});
      let transport;
      try {
        if(config.url){
          const headers={};if(config.bearerTokenEnvVar){const value=process.env[config.bearerTokenEnvVar];if(!value)throw new Error('Required environment variable is missing: '+config.bearerTokenEnvVar);headers.Authorization='Bearer '+value;}
          transport=new StreamableHTTPClientTransport(new URL(config.url),{requestInit:{headers}});
        }else{
          const env={...process.env,...config.env};delete env.ELECTRON_RUN_AS_NODE;
          transport=new StdioClientTransport({command:config.command,args:config.args,cwd:config.cwd,env,stderr:'pipe'});
          transport.stderr?.on('data',()=>{});
        }
        await client.connect(transport,{timeout:15000});
        const tools=[];let cursor;const seen=new Set();
        do{const page=await client.listTools(cursor?{cursor}:{},{timeout:15000});tools.push(...page.tools);cursor=page.nextCursor;if(cursor&&seen.has(cursor))throw new Error('MCP server repeated a tools cursor.');if(cursor)seen.add(cursor);}while(cursor);
        const item={client,tools,config};connected.set(name,item);states.set(name,{status:'connected',toolCount:tools.length});
        client.onclose=()=>{connected.delete(name);states.set(name,{status:'disconnected'});};
        return item;
      }catch(error){await client.close().catch(()=>{});states.set(name,{status:'error',error:error.message});throw error;}
    })();
    connecting.set(name,promise);try{return await promise;}finally{connecting.delete(name);}
  }
  const alias=(server,tool)=>'mcp_'+server.slice(0,30)+'_'+createHash('sha256').update(server+'\0'+tool).digest('hex').slice(0,16);
  return {
    async list(){return (await read()).map(s=>({...s,...states.get(s.name),status:states.get(s.name)?.status||'disconnected'}));},
    async save(input){const config=validateServer(input);await read();await disconnect(config.name);servers=servers.filter(s=>s.name!==config.name).concat(config);await fs.writeFile(configPath,JSON.stringify(servers,null,2),{mode:0o600});return config;},
    async remove(name){await read();await disconnect(name);servers=servers.filter(s=>s.name!==name);await fs.writeFile(configPath,JSON.stringify(servers,null,2),{mode:0o600});},
    async test(name){const item=await connect(name);return item.tools.map(t=>({name:t.name,description:t.description||''}));},
    async tools(){const tools=[],errors=[];for(const config of await read()){if(!config.enabled)continue;try{const item=await connect(config.name);for(const tool of item.tools){routes.set(alias(config.name,tool.name),{server:config.name,tool:tool.name});tools.push({type:'function',function:{name:alias(config.name,tool.name),description:`MCP ${config.name}: ${tool.description||tool.name}`,parameters:tool.inputSchema||{type:'object',properties:{}}}});}} catch(error){errors.push({server:config.name,error:error.message});}}return {tools,errors};},
    async call(name,args){const route=routes.get(name);if(!route)throw new Error('Unknown MCP tool. Refresh the server connection.');const item=await connect(route.server);if(!item.tools.some(t=>t.name===route.tool))throw new Error('MCP tool is no longer available.');return item.client.callTool({name:route.tool,arguments:args},undefined,{timeout:60000});},
    async close(){await Promise.allSettled((await read()).map(s=>disconnect(s.name)));},
  };
}
module.exports={createMcpManager,validateServer};
