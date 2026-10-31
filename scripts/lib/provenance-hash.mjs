// Development build/source checksums only: never credentials or gameplay authority.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const fileHash=path=>hash(readFileSync(path));

export function hashFiles(request){
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).join(',')!=='paths'||
    !Array.isArray(request.paths)||request.paths.length<1||request.paths.length>256||
    request.paths.some(path=>typeof path!=='string'||!path.length||path.length>4096||path.includes('\0'))||
    new Set(request.paths).size!==request.paths.length)throw new Error('Invalid checksum request');
  return {files:request.paths.map(path=>({path,sha256:fileHash(path)}))};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3||process.argv[2]!=='--hash-files')throw new Error('Unsupported checksum operation');
    const chunks=[];let size=0;
    for await(const chunk of process.stdin){size+=chunk.length;if(size>128*1024)throw new Error('Checksum request exceeds bound');chunks.push(chunk);}
    const request=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
    process.stdout.write(JSON.stringify(hashFiles(request)));
  }catch{
    // No partial hashes, source contents or caller-supplied input on failure.
    process.stderr.write('Provenance checksum request failed.\n');process.exitCode=1;
  }
}
