const{chromium}=require("playwright");
(async()=>{
  const b=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const c=await b.newContext({userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0",locale:"ru-RU"});
  const p=await c.newPage();
  await p.goto("https://steamcommunity.com/login/home/?goto=",{waitUntil:"domcontentloaded",timeout:60000});
  await p.waitForTimeout(5000);
  const r=await p.evaluate(()=>{
    const inputs=[...document.querySelectorAll("input")];
    const mapped=inputs.map((el,i)=>{
      const formEl=el.closest("form");
      return {
        i,type:el.type,name:el.name,id:el.id,
        placeholder:el.placeholder,autocomplete:el.autocomplete,
        cls:(el.className||"").substring(0,80),
        visible:el.offsetParent!==null,
        parentTag:el.parentElement?el.parentElement.tagName:"none",
        parentCls:(el.parentElement&&el.parentElement.className||"").substring(0,60),
        formCls:formEl?(formEl.className||"").substring(0,60):"NO_FORM"
      };
    });
    const buttons=[...document.querySelectorAll("button")].map((b,i)=>({
      i,text:(b.textContent||"").trim().substring(0,50),type:b.type,
      cls:(b.className||"").substring(0,60)
    }));
    return {url:location.href,title:document.title,inputCount:mapped.length,inputs:mapped,buttonCount:buttons.length,buttons};
  });
  console.log(JSON.stringify(r,null,2));
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1)})
