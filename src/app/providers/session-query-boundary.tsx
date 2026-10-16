import {useEffect,useState,type ReactNode} from "react";
import {useAuth} from "@clerk/clerk-react";
import {useQueryClient} from "@tanstack/react-query";
import {ContentSessionContext} from "@/shared/hooks/content-session";

export function SessionQueryBoundary({children}:{children:ReactNode}) {
  const {isLoaded,sessionId}=useAuth();
  const client=useQueryClient();
  const identity=isLoaded?sessionId??null:undefined;
  const [visibleIdentity,setVisibleIdentity]=useState(identity);
  useEffect(()=>{
    if(identity===undefined || identity===visibleIdentity) return;
    let current=true;
    void client.cancelQueries().then(()=>{
      if(!current) return;
      client.clear();
      setVisibleIdentity(identity);
    });
    return ()=>{current=false;};
  },[client,identity,visibleIdentity]);
  // A previous account's successful read must never render during a switch.
  return identity!==undefined && identity!==visibleIdentity?null:<ContentSessionContext.Provider value={identity??null}>{children}</ContentSessionContext.Provider>;
}
