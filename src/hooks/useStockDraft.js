import {useCallback,useEffect,useRef,useState} from 'react';
import {insertData,prepareStock} from '../services/platformClient.js';
import {buildRequestContextHeaders,getActiveTenantId,loadStoredSession} from '../services/requestContext.js';

// Tab-local editing aid. Once submitted, the server's pending stock is durable.
// Never reuse an uncertain preparation identity for edited data.
export const useStockDraft=({kind,parentId='',userId,tenantId,enabled,initialData})=>{
  const key=`quixo.stock-draft.v1:${userId}:${tenantId}:${kind}:${parentId}`;
  const [draft,setDraft]=useState(()=>{
    if(enabled&&userId&&tenantId){
      try{const saved=JSON.parse(sessionStorage.getItem(key));if(saved?.id&&saved?.data){return saved;}}catch{/* Editing remains available; submission verifies storage. */}
    }
    return {id:crypto.randomUUID(),data:initialData,coordinates:null,attempt:null};
  });
  const live=useRef(true);
  const busy=useRef(false);
  const completed=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>{
    if(enabled&&userId&&tenantId&&!completed.current){try{sessionStorage.setItem(key,JSON.stringify(draft));}catch{/* Submission reports inability to preserve a retry. */}}
  },[draft,enabled,key,userId,tenantId]);
  const setData=useCallback(update=>setDraft(prev=>({...prev,data:typeof update==='function'?update(prev.data):update})),[]);
  const setCoordinates=useCallback(update=>setDraft(prev=>({...prev,coordinates:typeof update==='function'?update(prev.coordinates):update})),[]);
  const create=async data=>{
    if(busy.current){throw new Error('A save is already in progress.');}
    const headers=buildRequestContextHeaders();
    const token=loadStoredSession()?.access_token;
    const isCurrent=()=>live.current&&getActiveTenantId()===tenantId&&loadStoredSession()?.access_token===token;
    if(!enabled||!userId||!tenantId||!isCurrent()){throw new Error('Your workspace changed. Reopen the property form to continue.');}
    busy.current=true;
    try{
      let attempt=draft.attempt;
      if(!attempt){
        try{
          const result=await insertData(kind==='property'?'properties':'property_units',data,{headers});
          if(result.error){throw result.error;}
          if(!isCurrent()){return {stale:true};}
          completed.current=true;
          try{sessionStorage.removeItem(key);}catch{/* The completed server record remains authoritative. */}
          return result;
        }catch(error){
          if(error.code!=='BILLING_STOCK_PREPARATION_REQUIRED'){throw error;}
        }
        if(!isCurrent()){return {stale:true};}
        const {status,...details}=data;
        delete details.createdat;delete details.updatedat;
        attempt={kind,payload:{...details,id:draft.id,availability:status||'available'}};
        const pending={...draft,attempt};
        // Preserve the exact request before any potentially ambiguous server write.
        try{sessionStorage.setItem(key,JSON.stringify(pending));}
        catch{throw new Error('Your browser could not retain this draft. Free some browser storage and retry; preparation has not been sent.');}
        setDraft(pending);
      }
      try{await prepareStock([attempt],{headers});}
      catch(error){
        if(isCurrent()&&[400,403,409].includes(error.status)&&error.code!=='BILLING_STOCK_CONFLICT'){
          const editable={...draft,attempt:null};sessionStorage.setItem(key,JSON.stringify(editable));setDraft(editable);
        }
        throw error;
      }
      if(!isCurrent()){return {stale:true};}
      completed.current=true;
          try{sessionStorage.removeItem(key);}catch{/* The completed server record remains authoritative. */}
      return {prepared:true};
    }finally{busy.current=false;}
  };
  return {data:draft.data,setData,coordinates:draft.coordinates,setCoordinates,pending:Boolean(draft.attempt),create};
};
