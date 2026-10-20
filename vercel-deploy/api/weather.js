const fs = require('node:fs/promises');
const path = require('node:path');

const LOCATION = {id:'seoul',name:'서울 중구 참고 좌표',note:'예제A점의 실제 위치가 아닙니다.',lat:37.5636,lon:126.9828,timezone:'Asia/Seoul'};
const TTL = 10 * 60 * 1000;
const REASONS = {
  'key-missing':'서버에 OPENWEATHER_API_KEY가 설정되지 않았습니다.',
  timeout:'OpenWeather 응답 제한 시간(8초)을 초과했습니다.',
  'provider-error':'OpenWeather 요청에 실패했습니다. 키 활성화·권한·호출 한도를 확인해 주세요.',
  'invalid-response':'OpenWeather 응답 형식이나 날짜를 확인할 수 없습니다.',
  'stale-data':'OpenWeather 관측 또는 예보 시각이 오래되었습니다.'
};
const day = seconds => new Date(seconds*1000).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'});
function invalid(reason='invalid-response') { const e = new Error(reason); e.reason=reason; return e; }
function normalize(current, forecast, timestamp) {
  const finite = n => typeof n==='number' && Number.isFinite(n);
  if (!current || !finite(current.dt) || !finite(current.main?.temp) || !finite(current.main?.feels_like) || !finite(current.main?.humidity) || !finite(current.wind?.speed) || !finite(current.weather?.[0]?.id) || typeof current.weather[0].description!=='string' || !Array.isArray(forecast?.list) || !forecast.list.length) throw invalid();
  if (Math.abs(timestamp-current.dt*1000)>2*60*60*1000) throw invalid('stale-data');
  const groups=new Map();
  for (const slot of forecast.list) {
    if (!finite(slot.dt) || !finite(slot.main?.temp_min) || !finite(slot.main?.temp_max) || !finite(slot.pop) || !finite(slot.weather?.[0]?.id) || typeof slot.weather[0].description!=='string') throw invalid();
    if(slot.dt*1000 < timestamp-3*60*60*1000) continue;
    const date=day(slot.dt);
    if(!groups.has(date)) groups.set(date,[]);
    groups.get(date).push(slot);
  }
  const dates=[...groups.keys()].sort().slice(0,5);
  if(dates.length<5) throw invalid('stale-data');
  const days=dates.map(date=>{
    const slots=groups.get(date), representative=slots[Math.floor(slots.length/2)];
    return {date,min:Math.min(...slots.map(s=>s.main.temp_min)),max:Math.max(...slots.map(s=>s.main.temp_max)),pop:Math.max(...slots.map(s=>s.pop)),description:representative.weather[0].description,conditionId:representative.weather[0].id,slots:slots.length};
  });
  return {mode:'live',status:'실시간 연결',reason:null,message:'OpenWeather 현재 관측 및 3시간 예보를 날짜별로 집계했습니다. 일별 최저·최고는 제공된 예보 구간 기준입니다.',location:LOCATION,source:{name:'OpenWeather · Current Weather / 5 Day Forecast',url:'https://openweathermap.org/'},fetchedAt:new Date(timestamp).toISOString(),observedAt:new Date(current.dt*1000).toISOString(),cached:false,current:{temp:current.main.temp,feelsLike:current.main.feels_like,humidity:current.main.humidity,wind:current.wind.speed,description:current.weather[0].description,conditionId:current.weather[0].id},forecast:days};
}
function createWeatherService({fetchImpl=global.fetch,now=Date.now,env=process.env,timeoutMs=8000,readSample=()=>fs.readFile(path.join(__dirname,'../D_화면과연결/11_날씨응답_예제.json'),'utf8')}={}) {
  let cache=null, pending=null;
  async function fallback(reason) {
    const sample=JSON.parse(await readSample());
    return {...sample,mode:'sample',status:'예제 날씨',reason,message:REASONS[reason]||REASONS['provider-error'],cached:false,requestedAt:new Date(now()).toISOString()};
  }
  async function load(key) {
    const controller=new AbortController();
    let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(invalid('timeout'));},timeoutMs);});
    try {
      const work=Promise.all(['weather','forecast'].map(async endpoint=>{
        // appid is required by OpenWeather. This HTTPS URL stays exclusively
        // in server memory; never log/return it or an upstream exception body.
        const url=new URL(`https://api.openweathermap.org/data/2.5/${endpoint}`);
        Object.entries({lat:LOCATION.lat,lon:LOCATION.lon,units:'metric',lang:'kr',appid:key}).forEach(([k,v])=>url.searchParams.set(k,v));
        const response=await fetchImpl(url,{signal:controller.signal,redirect:'error'});
        if(!response.ok) throw invalid('provider-error');
        return response.json();
      }));
      const [current,forecast]=await Promise.race([work,timeout]);
      const data=normalize(current,forecast,now());
      cache={key,data,expires:now()+TTL};
      return data;
    } catch(e) {
      controller.abort();
      return fallback(e.reason || (e.name==='AbortError'?'timeout':'provider-error'));
    } finally {clearTimeout(timer);}
  }
  return async function getWeather() {
    const key=String(env.OPENWEATHER_API_KEY||'').trim();
    if(!key) {cache=null;return fallback('key-missing');}
    if(cache?.key===key && now()<cache.expires) return {...cache.data,cached:true,requestedAt:new Date(now()).toISOString()};
    if(!pending) pending=load(key).finally(()=>{pending=null;});
    return {...await pending,requestedAt:new Date(now()).toISOString()};
  };
}
const getWeather=createWeatherService();
async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET') {res.setHeader('Allow','GET');res.statusCode=405;return res.end();}
  if(new URL(req.url,'http://localhost').search) {res.statusCode=400;return res.end('Query parameters are not supported.');}
  try {
    const data=await getWeather();res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));
  } catch {res.statusCode=503;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({mode:'error',reason:'sample-unavailable',message:'예제 날씨 파일을 읽지 못했습니다.'}));}
}
module.exports=handler;
module.exports.createWeatherService=createWeatherService;
module.exports.normalize=normalize;
