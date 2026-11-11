import crypto from 'node:crypto';
import {createSqlPublicSignupLimiter} from './publicSignupSqlLimiter.js';
import {createApprovedSignupPeerPredicate} from './publicSignupRuntime.js';
import {createAzureSignupClientAddress,normalizePublicSignupIp} from './publicSignupIngressGuard.js';

const checked=Symbol('credential-throttle-checked');
const unavailable=()=>Object.assign(new Error('Sign-in protection is temporarily unavailable. Please try again.'),{status:503,code:'AUTH_THROTTLE_UNAVAILABLE'});
// Local development only. Production always uses the existing shared SQL ledger.
const localLimiter=()=>{
  const buckets=new Map();
  return {async consume({key,max,windowSeconds}){
    const now=Date.now();for(const [k,b]of buckets){if(b.end<=now){buckets.delete(k);}}
    let b=buckets.get(key);if(!b){if(buckets.size>=10000){throw unavailable();}b={used:0,end:now+windowSeconds*1000};buckets.set(key,b);}
    if(b.used>=max){return false;}b.used++;return true;
  }};
};
export const createCredentialThrottle = ({env=process.env,limiter,clientAddress}={}) => {
  const production=env.NODE_ENV==='production';
  const store=limiter || (production?createSqlPublicSignupLimiter():localLimiter());
  const secret=env.AUTH_THROTTLE_SECRET || env.PUBLIC_SIGNUP_THROTTLE_SECRET || (production?'':crypto.randomBytes(32).toString('hex'));
  const proxyConfigured=Boolean(env.PUBLIC_SIGNUP_INGRESS_MODE || env.PUBLIC_SIGNUP_TRUSTED_INGRESS_PEERS);
  const proxyAddress=createAzureSignupClientAddress({
    azureManagedHttpIngress:production && env.PUBLIC_SIGNUP_INGRESS_MODE==='azure-container-apps-http',
    isTrustedIngressPeer:createApprovedSignupPeerPredicate(env.PUBLIC_SIGNUP_TRUSTED_INGRESS_PEERS)
  });
  const address=clientAddress || (req=>proxyConfigured?proxyAddress(req):normalizePublicSignupIp(req.socket?.remoteAddress));
  return kind => async(req,res,next)=>{
    try{
      if(req[checked]?.has(kind)){next();return;}
      if(!['signin','signup'].includes(kind)||Buffer.byteLength(secret)<32||(production&&store.durable!==true)){throw unavailable();}
      const ip=address(req);if(!ip){throw unavailable();}
      const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase().slice(0,320):'invalid';
      for(const [dimension,identity,max]of [['ip',ip,kind==='signin'?120:20],['email',email,kind==='signin'?10:4]]){
        const scope=`credential-${kind}-${dimension}`;
        const key=crypto.createHmac('sha256',secret).update(`quixo-credential-v1\0${scope}\0${identity}`).digest('hex');
        let allowed;try{allowed=await store.consume({scope,key,max:production?max:1000,windowSeconds:900});}catch{throw unavailable();}
        if(allowed!==true){res.set('Retry-After','900');return res.status(429).json({error:'Too many attempts. Please try again later.',code:'AUTH_RATE_LIMITED'});}
      }
      (req[checked] ||= new Set()).add(kind);
      next();
    }catch(error){next(error);}
  };
};
