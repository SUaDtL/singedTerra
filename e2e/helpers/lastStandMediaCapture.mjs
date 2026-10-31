import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runTool, fileHash } from './lastStandJourneyHost.mjs';

// Explicit host adapters keep tests on the same implementation used by journeys.
const defaultHost={join,mkdirSync,writeFileSync,runTool,fileHash,process,Date,Buffer};
export function createLastStandMediaCapture(overrides={}) {
  const {join,mkdirSync,writeFileSync,runTool,fileHash,process,Date,Buffer}={...defaultHost,...overrides};


function implementation_frameTiming(frames, begin, end) {
  const selected = frames.filter(t => begin <= t && t <= end);
  assert.ok(selected.length >= 30, 'Too few actual animation frames');
  const gaps = selected.slice(1).map((t, i) => t - selected[i]);
  assert.ok(gaps.every(gap => Number.isFinite(gap) && gap > 0), 'Invalid rAF timestamp gap');
  const sorted = [...gaps].sort((a, b) => a - b);
  return { callbacks: selected.length, observed_seconds: (selected.at(-1) - selected[0]) / 1000,
    median_ms: sorted[Math.floor(sorted.length / 2)], p95_ms: sorted[Math.ceil(sorted.length * .95) - 1],
    p99_ms: sorted[Math.ceil(sorted.length * .99) - 1], max_ms: sorted.at(-1),
    gaps_over_50ms: gaps.filter(x => x > 50).length, gaps_over_100ms: gaps.filter(x => x > 100).length };
}


async function implementation_startMotion(context, page, output) {
  const directory = join(output, 'normal-speed-repair'); mkdirSync(directory);
  const session = await context.newCDPSession(page);
  const frames = []; let stopped = false;
  session.on('Page.screencastFrame', async event => {
    if (!stopped) {
      const file = `frame-${String(frames.length).padStart(6, '0')}.jpg`;
      writeFileSync(join(directory, file), Buffer.from(event.data, 'base64'));
      frames.push({ file, timestamp: event.metadata.timestamp, metadata: event.metadata });
    }
    await session.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1600, maxHeight: 900, everyNthFrame: 2 });
  const stop = async () => {
    if (stopped) return;
    await session.send('Page.stopScreencast'); stopped = true; await session.detach();
    writeFileSync(join(directory, 'frames.json'), JSON.stringify({ method: 'actual independent CDP frames', frames }, null, 2));
  };
  return { stop, encode: async () => {
    await stop(); assert.ok(frames.length >= 2, 'Missing real CDP frames');
    assert.ok(frames.every(frame=>Number.isFinite(frame.timestamp)),'Invalid CDP timestamp');
    // Preserve raw delivery order above. Asynchronously encoded CDP frames can
    // arrive out of capture order; present all of them by their native stamps.
    const presentation=frames.map((frame,index)=>({frame,index})).sort((a,b)=>a.frame.timestamp-b.frame.timestamp);
    const ordered=presentation.map(item=>item.frame);
    const durations = ordered.slice(1).map((frame, i) => frame.timestamp - ordered[i].timestamp);
    assert.ok(durations.every(x => Number.isFinite(x) && x > 0), 'Non-increasing CDP timestamps');
    const lines = ['ffconcat version 1.0'];
    durations.forEach((duration, i) => lines.push(`file '${ordered[i].file}'`, 'option framerate 1000', `duration ${duration.toFixed(9)}`));
    lines.push(`file '${ordered.at(-1).file}'`, 'option framerate 1000');
    writeFileSync(join(directory, 'timeline.txt'), `${lines.join('\n')}\n`);
    const movie = join(output, 'normal-speed-repair.mp4');
    const encoded = runTool('ffmpeg', ['-hide_banner', '-nostdin', '-f', 'concat', '-safe', '0', '-i', 'timeline.txt',
      '-fps_mode', 'vfr', '-c:v', 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p',
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-movflags', '+faststart', movie], { cwd: directory, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
    writeFileSync(join(directory, 'ffmpeg.log'), encoded);
    const stream = JSON.parse(runTool('ffprobe', ['-v','error','-select_streams','v:0','-count_frames',
      '-show_entries','stream=nb_read_frames,duration','-of','json', movie])).streams[0];
    const duration = durations.reduce((a,b) => a+b,0);
    assert.equal(Number(stream.nb_read_frames), frames.length, 'Encoded movie dropped/duplicated independent CDP frames');
    assert.ok(Math.abs(Number(stream.duration) - duration) <= .25, 'Movie time differs from native timestamps');
    return { file: 'normal-speed-repair.mp4', sha256: fileHash(movie), frames: frames.length,
      encoded_frames: Number(stream.nb_read_frames), duration_seconds: duration,
      encoded_duration_seconds: Number(stream.duration), minimum_frame_seconds: Math.min(...durations),
      maximum_frame_seconds: Math.max(...durations), raw: 'normal-speed-repair/frames.json',
      raw_sha256: fileHash(join(directory, 'frames.json')), mode: 'normal speed from captured timestamps',
      presentation_order:presentation.map(item=>item.index),timeline:'normal-speed-repair/timeline.txt',
      timeline_sha256:fileHash(join(directory,'timeline.txt')) };
  } };
}


function implementation_decodedAudio(path, begin, duration) {
  const pcm = runTool('ffmpeg', ['-hide_banner','-loglevel','error','-nostdin','-i',path,
    '-ss',Math.max(0,begin).toFixed(3),'-t',duration.toFixed(3),'-vn','-ac','1','-ar','16000','-f','s16le','-']);
  assert.ok(pcm.length >= 3200, 'Recorded WebAudio decode missing/too short');
  let power = 0, peak = 0;
  for (let i=0;i+1<pcm.length;i+=2) { const value=pcm.readInt16LE(i); power+=value*value; peak=Math.max(peak,Math.abs(value)); }
  return { samples: pcm.length/2, rms: Math.sqrt(power/(pcm.length/2))/32768, peak:peak/32768,
    method:'ffmpeg decoded captured rendered Opus to mono 16 kHz PCM' };
}

// Serialized into the current document. Observe only: no start/resume/finish calls.
function implementation_renderedAudioSnapshot({withSamples=false}={}) {
  const observer=window.__stAudioCapture,captures=observer?.captures??[],errors=observer?.errors??[];
  const finite=value=>Number.isFinite(value)?value:null;
  const bounds=items=>items.reduce((result,item)=>Number.isFinite(item.t)
    ?{first:Math.min(result?.first??item.t,item.t),last:Math.max(result?.last??item.t,item.t)}:result,null);
  const samples=captures.flatMap(capture=>capture.samples);
  const diagnostics={schema_version:1,observed_at_ms:performance.now(),time_origin_ms:performance.timeOrigin,
    document:{pathname:location.pathname.slice(0,500),hidden:document.hidden,focused:document.hasFocus()},
    present:Boolean(observer),supported:observer?.supported??null,error_count:errors.length,
    errors:errors.slice(0,8).map(error=>String(error).slice(0,500)),errors_truncated:Math.max(0,errors.length-8),
    capture_count:captures.length,captures_truncated:Math.max(0,captures.length-8),
    sample_count:samples.length,sample_bounds:bounds(samples),
    captures:captures.slice(0,8).map((capture,index)=>({index,
      context_state:capture.context?.state??null,context_time:finite(capture.context?.currentTime),sample_rate:finite(capture.context?.sampleRate),
      recorder_state:capture.recorder?.state??null,started:finite(capture.started),finish_count:finite(capture.finish_count),
      timer:{active:capture.timer_active??null,started:finite(capture.timer_started),stopped:finite(capture.timer_stopped),
        ticks:finite(capture.timer_ticks),last_tick:finite(capture.last_timer_tick)},
      sample_count:capture.samples.length,sample_bounds:bounds(capture.samples)}))};
  // Keep the original absent-observer read error, rather than inventing samples.
  return {diagnostics,samples:withSamples?window.__stAudioCapture.captures.flatMap(c=>c.samples):undefined};
}

function implementation_retainAudioDiagnostic(report, diagnostic) {
  if(!report)return;
  const retained=report.audio_diagnostics??=[];retained.push(diagnostic);
  if(retained.length>16){retained.shift();report.audio_diagnostics_dropped=(report.audio_diagnostics_dropped??0)+1;}
}

async function implementation_retainRenderedAudioDiagnostics(page, report, observation={}) {
  let diagnostic;
  try {diagnostic=(await page.evaluate(renderedAudioSnapshot)).diagnostics;}
  catch(error) {diagnostic={schema_version:1,present:null,supported:null,capture_count:null,sample_count:null,
    diagnostic_error:String(error).slice(0,500)};}
  const retained={...diagnostic,...observation};retainAudioDiagnostic(report,retained);return retained;
}

async function implementation_measureRenderedAudioEnergy(page, begin, end, check, min=5, {report,load,scope}={}) {
  let observed;
  const window={begin,end,min,inclusive:true,samples:null,sample_bounds:null};
  try {observed=await page.evaluate(renderedAudioSnapshot,{withSamples:true});}
  catch(error) {
    await retainRenderedAudioDiagnostics(page,report,{load,scope,kind:'energy-window',window});
    throw error;
  }
  const samples=observed.samples,selected=samples.filter(item=>begin<=item.t && item.t<=end);
  const diagnostic={...observed.diagnostics,load,scope,kind:'energy-window',window:{...window,samples:selected.length,
    sample_bounds:selected.reduce((result,item)=>({first:Math.min(result?.first??item.t,item.t),last:Math.max(result?.last??item.t,item.t)}),null)}};
  retainAudioDiagnostic(report,diagnostic);
  check(selected.length>=min,'enough measured rendered WebAudio samples',diagnostic);
  return{samples:selected.length,maximum_rms:Math.max(...selected.map(item=>item.rms)),mean_rms:selected.reduce((sum,item)=>sum+item.rms,0)/selected.length};
}

const FRAME_PROBE = "(() => {\n  let active = false;\n  let frames = [];\n  let generation = 0;\n  function sample(t, current) {\n    if (!active || current !== generation) return;\n    if (frames.length < 30000) frames.push(t);\n    requestAnimationFrame(next => sample(next, current));\n  }\n  window.__stFrameProbe = {\n    start() {\n      frames = []; active = true; generation++;\n      const current = generation;\n      requestAnimationFrame(t => sample(t, current));\n      return performance.now();\n    },\n    stop() { active = false; generation++; return frames; }\n  };\n})()";

const AUDIO_CAPTURE = "(() => {\n  const original = AudioNode.prototype.connect;\n  const originalDisconnect = AudioNode.prototype.disconnect;\n  const captures = [];\n  const byContext = new WeakMap();\n  const mirrored = new WeakMap();\n  const supported = typeof MediaRecorder !== 'undefined' &&\n    MediaRecorder.isTypeSupported('audio/webm;codecs=opus');\n  window.__stAudioCapture = {supported, captures, errors: []};\n  if (!supported) return;\n  AudioNode.prototype.connect = function(...args) {\n    const result = original.apply(this, args);\n    if (args[0] !== this.context.destination) return result;\n    try {\n      let capture = byContext.get(this.context);\n      if (!capture) {\n        const stream = this.context.createMediaStreamDestination();\n        const analyser = this.context.createAnalyser();\n        analyser.fftSize = 2048;\n        const chunks = [];\n        const recorder = new MediaRecorder(stream.stream, {mimeType:'audio/webm;codecs=opus'});\n        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };\n        recorder.onerror = e => window.__stAudioCapture.errors.push(String(e.error || e));\n        capture = {stream, analyser, recorder, chunks, samples: [], started: null, context:this.context,\n          timer_active:false, timer_started:null, timer_stopped:null, timer_ticks:0, last_timer_tick:null, finish_count:0};\n        byContext.set(this.context, capture);\n        captures.push(capture);\n        const context = this.context;\n        const startIfRunning = () => {\n          if (context.state === 'running' && recorder.state === 'inactive' && capture.started === null) {\n            capture.started = performance.now();\n            recorder.start(1000);\n          }\n        };\n        context.addEventListener('statechange', startIfRunning);\n        startIfRunning();\n        const values = new Float32Array(analyser.fftSize);\n        capture.timer_started = performance.now();\n        capture.timer = setInterval(() => {\n          analyser.getFloatTimeDomainData(values);\n          let power = 0, peak = 0;\n          for (const value of values) { power += value * value; peak = Math.max(peak, Math.abs(value)); }\n          capture.timer_ticks++; capture.last_timer_tick = performance.now();\n          if (capture.samples.length < 30000)\n            capture.samples.push({t:capture.last_timer_tick, rms:Math.sqrt(power / values.length), peak});\n        }, 20);\n        capture.timer_active = true;\n      }\n      const outputIndex = args.length > 1 ? args[1] : 0;\n      original.call(this, capture.stream, outputIndex);\n      original.call(this, capture.analyser, outputIndex);\n      mirrored.set(this, capture);\n    } catch (error) { window.__stAudioCapture.errors.push(String(error)); }\n    return result;\n  };\n  AudioNode.prototype.disconnect = function(...args) {\n    const result = originalDisconnect.apply(this, args);\n    const capture = mirrored.get(this);\n    if (!capture) return result;\n    if (!args.length) { mirrored.delete(this); return result; }\n    if (typeof args[0] === 'number' || args[0] !== this.context.destination) return result;\n    try {\n      const mirrorArgs = [capture.stream, ...args.slice(1)];\n      originalDisconnect.apply(this, mirrorArgs);\n      mirrorArgs[0] = capture.analyser;\n      originalDisconnect.apply(this, mirrorArgs);\n    } catch (error) { window.__stAudioCapture.errors.push(String(error)); }\n    return result;\n  };\n  window.__stAudioCapture.finish = async () => {\n    const result = [];\n    for (const capture of captures) {\n      clearInterval(capture.timer);\n      capture.timer_active = false; capture.timer_stopped = performance.now(); capture.finish_count++;\n      if (capture.recorder.state !== 'inactive') {\n        await new Promise(resolve => { capture.recorder.onstop = resolve; capture.recorder.stop(); });\n      }\n      const bytes = new Uint8Array(await new Blob(capture.chunks, {type:'audio/webm'}).arrayBuffer());\n      let binary = '';\n      for (let i = 0; i < bytes.length; i += 16384)\n        binary += String.fromCharCode(...bytes.subarray(i, i + 16384));\n      result.push({audio:btoa(binary), samples:capture.samples, started:capture.started,\n        bytes:bytes.length, mime:'audio/webm;codecs=opus'});\n    }\n    return {supported, errors:window.__stAudioCapture.errors, captures:result};\n  };\n})();";
  const frameTiming=overrides.frameTiming??implementation_frameTiming;
  const startMotion=overrides.startMotion??implementation_startMotion;
  const decodedAudio=overrides.decodedAudio??implementation_decodedAudio;
  const renderedAudioSnapshot=overrides.renderedAudioSnapshot??implementation_renderedAudioSnapshot;
  const retainAudioDiagnostic=overrides.retainAudioDiagnostic??implementation_retainAudioDiagnostic;
  const retainRenderedAudioDiagnostics=overrides.retainRenderedAudioDiagnostics??implementation_retainRenderedAudioDiagnostics;
  const measureRenderedAudioEnergy=overrides.measureRenderedAudioEnergy??implementation_measureRenderedAudioEnergy;
  return {frameTiming,startMotion,decodedAudio,renderedAudioSnapshot,retainAudioDiagnostic,retainRenderedAudioDiagnostics,measureRenderedAudioEnergy,FRAME_PROBE,AUDIO_CAPTURE};
}
const defaultOwner=createLastStandMediaCapture();
export const {frameTiming,startMotion,decodedAudio,retainRenderedAudioDiagnostics,measureRenderedAudioEnergy,FRAME_PROBE,AUDIO_CAPTURE}=defaultOwner;
