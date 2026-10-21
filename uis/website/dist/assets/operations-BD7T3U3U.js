/* empty css               */(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))a(o);new MutationObserver(o=>{for(const r of o)if(r.type==="childList")for(const l of r.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&a(l)}).observe(document,{childList:!0,subtree:!0});function n(o){const r={};return o.integrity&&(r.integrity=o.integrity),o.referrerPolicy&&(r.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?r.credentials="include":o.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function a(o){if(o.ep)return;o.ep=!0;const r=n(o);fetch(o.href,r)}})();function j(e){return e.slice(0,10)}function K(e,t){return e[t]}function Be(e,t){return t==="Colombia"?e.isAvailableInColombia:e.isAvailableInUSA}function Ae(e,t,n){return e.country===t&&e.city===n}function Pe(e,t){return Be(e,t.country)}function Q(e,t){return K(e.totalPrice,t)}function Me(e,t,n){const a=w(t,o=>o.id===e.itemId);return a.item?K(a.item.ingredientCost,n)*e.quantity:0}function Re(e,t,n){return Q(e,n)-Me(e,t,n)}function Te(e,t){return K(e.cost,t)}function _(e,t){return B(e,n=>Te(n,t))}function ee(e,t){return e.length===0?[]:e.filter(t)}function we(e,t){return e.length===0?[]:[...e].sort(t)}function w(e,t){if(e.length===0)return{found:!1,index:-1,item:null};for(let n=0;n<e.length;n+=1)if(t(e[n]))return{found:!0,index:n,item:e[n]};return{found:!1,index:-1,item:null}}function $e(e,t,n,a){if(e.length===0)return{found:!1,index:-1,item:null};let o=0,r=e.length-1;for(;o<=r;){const l=Math.floor((o+r)/2),b=n(e[l]),v=a(b,t);if(v===0)return{found:!0,index:l,item:e[l]};v<0?o=l+1:r=l-1}return{found:!1,index:-1,item:null}}function z(e,t){const n=new Map;return e.forEach(a=>{const o=t(a),r=n.get(o)??[];r.push(a),n.set(o,r)}),n}function Ie(e,t){const n=new Map;return e.forEach(a=>{const o=t(a);n.set(o,(n.get(o)??0)+1)}),n}function B(e,t){return e.reduce((n,a)=>n+t(a),0)}function ke(e,t){return e.length===0?null:e.reduce((n,a)=>t(a)>t(n)?a:n)}function i(e,t,n){return{entityName:e,field:t,message:n}}function qe(e){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())}function We(e,t){const n=e.trim();return/^\+\d{1,3}\s[\d\s-]{6,}$/.test(n)?t==="Colombia"?n.startsWith("+57"):n.startsWith("+1"):!1}function He(e,t,n){const a=w(e,r=>r.from===t&&r.to===n);if(a.item)return a.item.rate;const o=w(e,r=>r.from===n&&r.to===t);if(o.item)return 1/o.item.rate;throw new Error(`Missing exchange rate from ${t} to ${n}`)}function ze(e,t,n,a){return e*He(a,t,n)}function X(e,t){return ee(e,n=>n.locationId===t)}function je(e,t){return ee(e,n=>{const a=j(n.timestamp.toISOString());return a>=t.startDate&&a<=t.endDate})}function Oe(e,t){return ee(e,n=>n.itemId===t)}function Fe(e,t){return w(e,n=>{const a=n.locationId===t.locationId,o=n.itemId===t.menuItemId,r=j(n.timestamp.toISOString())===t.soldOn;return a&&o&&r})}function Ve(e,t){return $e(e,t,n=>j(n.timestamp.toISOString()),(n,a)=>n.localeCompare(a))}function A(e,t,n,a){const o=B(e,b=>Q(b,n)),r=B(e,b=>Me(b,t,n)),l=o-r;return{currency:n,revenue:o,cost:r,margin:l,marginPercentage:o===0?0:l/o*100}}function De(e){const t=z(e.sales,l=>l.locationId),n=e.locations.map(l=>{const b=t.get(l.id)??[];return{location:l,revenue:B(b,v=>Q(v,"USD")),margin:B(b,v=>Re(v,e.menuItems,"USD")),volume:B(b,v=>v.quantity)}}),a=Math.max(...n.map(l=>l.revenue),1),o=Math.max(...n.map(l=>l.margin),1),r=Math.max(...n.map(l=>l.volume),1);return n.map(l=>{const b=l.revenue/a*45,v=l.margin/o*35,R=l.volume/r*20;return{locationId:l.location.id,locationName:l.location.name,score:Number((b+v+R).toFixed(2)),revenueWeight:Number(b.toFixed(2)),marginWeight:Number(v.toFixed(2)),salesVolumeWeight:Number(R.toFixed(2))}})}function Ze(e){const t=[];return e.id.trim()||t.push(i(e.name,"id","Branch id is required.")),e.name.trim()||t.push(i(e.id,"name","Branch name is required.")),(e.openingYear<2008||e.openingYear>new Date().getFullYear())&&t.push(i(e.name,"openingYear","Opening year must be between 2008 and the current year.")),e.seatingCapacity<=0&&t.push(i(e.name,"seatingCapacity","Seating capacity must be greater than zero.")),e.staffCount<=0&&t.push(i(e.name,"staffCount","Staff count must be greater than zero.")),(e.monthlyRentCost.USD<=0||e.monthlyRentCost.COP<=0)&&t.push(i(e.name,"monthlyRentCost","Both rent values must be greater than zero.")),(e.averageMonthlyUtilities.USD<=0||e.averageMonthlyUtilities.COP<=0)&&t.push(i(e.name,"averageMonthlyUtilities","Both utilities values must be greater than zero.")),e.manager.trim()||t.push(i(e.name,"manager","Branch manager name is required.")),t}function Xe(e,t){const n=[];e.id.trim()||n.push(i(e.name,"id","Menu item id is required.")),e.name.trim()||n.push(i(e.id,"name","Menu item name is required.")),e.name.trim()||n.push(i(e.id,"name","Menu item name is required.")),e.basePrice.USD<=0&&n.push(i(e.name,"basePrice.USD","USD price must be greater than zero.")),e.basePrice.COP<=0&&n.push(i(e.name,"basePrice.COP","COP price must be greater than zero.")),e.ingredientCost.USD<=0&&n.push(i(e.name,"ingredientCost.USD","USD ingredient cost must be greater than zero.")),e.ingredientCost.COP<=0&&n.push(i(e.name,"ingredientCost.COP","COP ingredient cost must be greater than zero.")),(e.prepTimeMinutes<=0||e.prepTimeMinutes>60)&&n.push(i(e.name,"prepTimeMinutes","Preparation time must be greater than zero and no more than 60 minutes.")),!e.isAvailableInColombia&&!e.isAvailableInUSA&&n.push(i(e.name,"availability","Menu item must be available in at least one country."));const a=new Set;return e.isAvailableInColombia&&a.add("Colombia"),e.isAvailableInUSA&&a.add("USA"),a.size>0&&(t.some(r=>a.has(r.country))||n.push(i(e.name,"availability","Menu item availability must match at least one configured location country."))),n}function Ye(e,t,n){const a=[];e.id.trim()||a.push(i("Sale","id","Sale id is required.")),e.quantity<=0&&a.push(i(e.id,"quantity","Sale quantity must be greater than zero.")),e.totalPrice.USD<=0&&a.push(i(e.id,"totalPrice.USD","USD price must be greater than zero.")),e.totalPrice.COP<=0&&a.push(i(e.id,"totalPrice.COP","COP price must be greater than zero.")),e.waiterName.trim()||a.push(i(e.id,"waiterName","Waiter name is required.")),(!(e.timestamp instanceof Date)||Number.isNaN(e.timestamp.getTime()))&&a.push(i(e.id,"timestamp","Sale date must be a valid Date."));const o=w(n,l=>l.id===e.locationId);o.found||a.push(i(e.id,"locationId","Sale location must exist."));const r=w(t,l=>l.id===e.itemId);return r.found||a.push(i(e.id,"itemId","Sale product must exist.")),r.item&&o.item&&!Pe(r.item,o.item)&&a.push(i(e.id,"itemId","Menu item is not available at the recorded location.")),a}function Ge(e,t,n){const a=[];e.id.trim()||a.push(i("Waste","id","Waste record id is required.")),e.quantity<=0&&a.push(i(e.id,"quantity","Waste quantity must be greater than zero.")),e.cost.USD<=0&&a.push(i(e.id,"cost.USD","USD waste cost must be greater than zero.")),e.cost.COP<=0&&a.push(i(e.id,"cost.COP","COP waste cost must be greater than zero.")),e.reportedBy.trim()||a.push(i(e.id,"reportedBy","Waste record reporter name is required.")),(!(e.timestamp instanceof Date)||Number.isNaN(e.timestamp.getTime()))&&a.push(i(e.id,"timestamp","Waste record date must be a valid Date."));const o=w(n,l=>l.id===e.locationId);o.found||a.push(i(e.id,"locationId","Waste record location must exist."));const r=w(t,l=>l.id===e.itemId);return r.found||a.push(i(e.id,"itemId","Waste record item must exist.")),r.item&&o.item&&!Pe(r.item,o.item)&&a.push(i(e.id,"itemId","Waste item is not available at the recorded location.")),a}function Je(e){const t=[];return e.forEach((n,a)=>{n.rate<=0&&t.push(i(`exchangeRates[${a}]`,"rate","Exchange rate must be greater than zero."))}),t}function _e(e){const t=[];return e.fullName.trim()||t.push(i(e.id,"fullName","Employee full name is required.")),e.trainedRoles.length===0&&t.push(i(e.fullName,"trainedRoles","Employee must be trained for at least one role.")),e.weeklyHourLimit<=0&&t.push(i(e.fullName,"weeklyHourLimit","Weekly hour limit must be greater than zero.")),e.scheduledHours<0&&t.push(i(e.fullName,"scheduledHours","Scheduled hours cannot be negative.")),e.hourlyRateUsd<=0&&t.push(i(e.fullName,"hourlyRateUsd","Hourly rate must be greater than zero.")),e.scheduledHours>e.weeklyHourLimit&&!e.managementApprovedOvertime&&t.push(i(e.fullName,"scheduledHours","Scheduled hours cannot exceed the weekly cap without management approval.")),e.endDate&&e.endDate<e.startDate&&t.push(i(e.fullName,"endDate","End date must be after the start date.")),t}function Ke(e){const t=[];return e.name.trim()||t.push(i(e.sku,"name","Inventory item name is required.")),e.quantityOnHand<0&&t.push(i(e.name,"quantityOnHand","Quantity on hand cannot be negative.")),e.reorderLevel<0&&t.push(i(e.name,"reorderLevel","Reorder level cannot be negative.")),e.unitCostUsd<=0&&t.push(i(e.name,"unitCostUsd","Unit cost must be greater than zero.")),e.expirationDate&&e.expirationDate<e.lastRestockedOn&&t.push(i(e.name,"expirationDate","Expiration date must be later than the last restock date.")),t}function Qe(e,t){const n=[];if(e.fullName.trim().split(/\s+/).length<2&&n.push(i(e.id,"fullName","Member must include first and last name.")),qe(e.email)||n.push(i(e.fullName,"email","Email format is invalid.")),We(e.phone,e.country)||n.push(i(e.fullName,"phone","Phone must match the selected country code.")),e.acceptedTerms||n.push(i(e.fullName,"acceptedTerms","Program terms must be accepted.")),e.isAdult()||n.push(i(e.fullName,"dateOfBirth","Member must be 18 or older.")),e.favoriteLocationId){const a=w(t,o=>o.id===e.favoriteLocationId);(!a.found||!a.item||!Ae(a.item,e.country,e.city))&&n.push(i(e.fullName,"favoriteLocationId","Favorite location must belong to the selected country and city."))}return n}function et(e){return[...e.locations.flatMap(t=>Ze(t)),...e.employees.flatMap(t=>_e(t)),...e.inventoryItems.flatMap(t=>Ke(t)),...e.loyaltyMembers.flatMap(t=>Qe(t,e.locations)),...(e.menuItems??[]).flatMap(t=>Xe(t,e.locations)),...(e.sales??[]).flatMap(t=>Ye(t,e.menuItems??[],e.locations)),...(e.wasteRecords??[]).flatMap(t=>Ge(t,e.menuItems??[],e.locations)),...Je(e.exchangeRates??[])]}function tt(e){return Array.from(e.entries()).map(([t,n])=>({label:t,count:n}))}function Y(e){const t=e.wasteRecords??[],n=A(e.sales,e.menuItems,e.currency,e.exchangeRates),a=z(e.sales,m=>m.locationId),o=e.locations.map(m=>{const I=a.get(m.id)??[];return{locationId:m.id,locationName:m.name,salesCount:I.length,unitsSold:B(I,V=>V.quantity),metrics:A(I,e.menuItems,e.currency,e.exchangeRates)}}),r=z(e.sales,m=>m.itemId),l=e.menuItems.map(m=>({menuItemName:m.name,unitsSold:B(r.get(m.id)??[],I=>I.quantity)})),b=Ie(e.sales,m=>m.paymentMethod),v=Ie(t,m=>m.reason),R=z(e.sales,m=>j(m.timestamp.toISOString())),F=we(Array.from(R.entries()).map(([m,I])=>({date:m,revenue:A(I,e.menuItems,e.currency,e.exchangeRates).revenue})),(m,I)=>m.date.localeCompare(I.date)),$=ke(o,m=>m.metrics.revenue);return{currency:e.currency,totals:n,revenueByLocation:o,unitsSoldByProduct:l,salesByPaymentMethod:b,wasteByReason:v,totalWasteCost:_(t,e.currency),dailyRevenue:F,topLocation:$}}const L=[{id:"LOC-MEDELLIN-01",name:"Brasaland El Poblado",city:"Medellín",country:"Colombia",openingYear:2008,seatingCapacity:120,staffCount:28,monthlyRentCost:{USD:4200,COP:1701e4},averageMonthlyUtilities:{USD:850,COP:3442500},manager:"Lucia Herrera",status:"Active"},{id:"LOC-BOGOTA-01",name:"Brasaland Usaquén",city:"Bogotá",country:"Colombia",openingYear:2013,seatingCapacity:96,staffCount:24,monthlyRentCost:{USD:3900,COP:15795e3},averageMonthlyUtilities:{USD:780,COP:3159e3},manager:"Camila Ospina",status:"Active"},{id:"LOC-CALI-01",name:"Brasaland Granada",city:"Cali",country:"Colombia",openingYear:2016,seatingCapacity:88,staffCount:21,monthlyRentCost:{USD:3100,COP:12555e3},averageMonthlyUtilities:{USD:690,COP:2794500},manager:"Mateo Salazar",status:"Under renovation"},{id:"LOC-MIAMI-01",name:"Brasaland Brickell",city:"Miami",country:"USA",openingYear:2021,seatingCapacity:110,staffCount:26,monthlyRentCost:{USD:8800,COP:3564e4},averageMonthlyUtilities:{USD:1200,COP:486e4},manager:"Jacob Reed",status:"Active"},{id:"LOC-ORLANDO-01",name:"Brasaland Downtown",city:"Orlando",country:"USA",openingYear:2022,seatingCapacity:104,staffCount:23,monthlyRentCost:{USD:7600,COP:3078e4},averageMonthlyUtilities:{USD:980,COP:3969e3},manager:"Sofia Rojas",status:"Temporarily closed"}],C=[{id:"menu-churrasco",name:"Signature Churrasco",category:"Meat",basePrice:{USD:24,COP:97200},ingredientCost:{USD:9.4,COP:38070},prepTimeMinutes:18,isAvailableInColombia:!0,isAvailableInUSA:!0,allergens:[],status:"Active"},{id:"menu-family-combo",name:"Brasa Family Combo",category:"Combo",basePrice:{USD:38,COP:153900},ingredientCost:{USD:15.6,COP:63180},prepTimeMinutes:24,isAvailableInColombia:!0,isAvailableInUSA:!0,allergens:["Dairy"],status:"Active"},{id:"menu-arepas",name:"Smoked Arepas",category:"Side",basePrice:{USD:7,COP:28350},ingredientCost:{USD:2.1,COP:8505},prepTimeMinutes:10,isAvailableInColombia:!0,isAvailableInUSA:!0,allergens:["Corn"],status:"Seasonal"},{id:"menu-guava-soda",name:"Guava Soda",category:"Beverage",basePrice:{USD:4,COP:16200},ingredientCost:{USD:1,COP:4050},prepTimeMinutes:3,isAvailableInColombia:!0,isAvailableInUSA:!0,allergens:[],status:"Active"}],y=[{id:"TXN-2026-1005",locationId:"LOC-ORLANDO-01",itemId:"menu-family-combo",quantity:7,totalPrice:{USD:266,COP:1077300},paymentMethod:"Credit card",timestamp:new Date("2026-08-05T18:20:00Z"),waiterName:"Sofia Rojas"},{id:"TXN-2026-1001",locationId:"LOC-MEDELLIN-01",itemId:"menu-churrasco",quantity:12,totalPrice:{USD:288,COP:1166400},paymentMethod:"Cash",timestamp:new Date("2026-08-06T17:45:00Z"),waiterName:"Lucia Herrera"},{id:"TXN-2026-1002",locationId:"LOC-BOGOTA-01",itemId:"menu-churrasco",quantity:8,totalPrice:{USD:184,COP:745200},paymentMethod:"Digital wallet",timestamp:new Date("2026-08-06T19:10:00Z"),waiterName:"Camila Ospina"},{id:"TXN-2026-1003",locationId:"LOC-CALI-01",itemId:"menu-family-combo",quantity:6,totalPrice:{USD:228,COP:923400},paymentMethod:"Debit card",timestamp:new Date("2026-08-07T20:00:00Z"),waiterName:"Mateo Salazar"},{id:"TXN-2026-1004",locationId:"LOC-MIAMI-01",itemId:"menu-guava-soda",quantity:18,totalPrice:{USD:72,COP:291600},paymentMethod:"Credit card",timestamp:new Date("2026-08-07T21:15:00Z"),waiterName:"Jacob Reed"},{id:"TXN-2026-1006",locationId:"LOC-MEDELLIN-01",itemId:"menu-arepas",quantity:20,totalPrice:{USD:140,COP:567e3},paymentMethod:"Cash",timestamp:new Date("2026-08-08T12:05:00Z"),waiterName:"Lucia Herrera"},{id:"TXN-2026-1007",locationId:"LOC-MIAMI-01",itemId:"menu-churrasco",quantity:9,totalPrice:{USD:216,COP:874800},paymentMethod:"Digital wallet",timestamp:new Date("2026-08-08T19:22:00Z"),waiterName:"Jacob Reed"},{id:"TXN-2026-1008",locationId:"LOC-BOGOTA-01",itemId:"menu-arepas",quantity:15,totalPrice:{USD:105,COP:425250},paymentMethod:"Debit card",timestamp:new Date("2026-08-09T13:05:00Z"),waiterName:"Camila Ospina"},{id:"TXN-2026-1009",locationId:"LOC-MEDELLIN-01",itemId:"menu-family-combo",quantity:5,totalPrice:{USD:190,COP:769500},paymentMethod:"Credit card",timestamp:new Date("2026-08-09T20:12:00Z"),waiterName:"Lucia Herrera"},{id:"TXN-2026-1010",locationId:"LOC-ORLANDO-01",itemId:"menu-guava-soda",quantity:10,totalPrice:{USD:40,COP:162e3},paymentMethod:"Cash",timestamp:new Date("2026-08-10T17:40:00Z"),waiterName:"Sofia Rojas"}],W=[{from:"USD",to:"COP",rate:4050},{from:"COP",to:"USD",rate:1/4050}],E=[{id:"WASTE-2026-001",locationId:"LOC-MEDELLIN-01",itemId:"menu-churrasco",quantity:2,reason:"Cooking error",cost:{USD:18.8,COP:76140},timestamp:new Date("2026-08-06T18:05:00Z"),reportedBy:"Lucia Herrera"},{id:"WASTE-2026-002",locationId:"LOC-MIAMI-01",itemId:"menu-guava-soda",quantity:3,reason:"Damage",cost:{USD:3,COP:12150},timestamp:new Date("2026-08-07T21:40:00Z"),reportedBy:"Jacob Reed"},{id:"WASTE-2026-003",locationId:"LOC-BOGOTA-01",itemId:"menu-arepas",quantity:4,reason:"Expired",cost:{USD:8.4,COP:34020},timestamp:new Date("2026-08-08T10:10:00Z"),reportedBy:"Camila Ospina"},{id:"WASTE-2026-004",locationId:"LOC-ORLANDO-01",itemId:"menu-family-combo",quantity:1,reason:"Customer return",cost:{USD:15.6,COP:63180},timestamp:new Date("2026-08-09T21:03:00Z"),reportedBy:"Sofia Rojas"},{id:"WASTE-2026-005",locationId:"LOC-MEDELLIN-01",itemId:"menu-arepas",quantity:2,reason:"Other",cost:{USD:4.2,COP:17010},timestamp:new Date("2026-08-10T11:22:00Z"),reportedBy:"Lucia Herrera"}];function nt(e){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(e)}function at(e){return new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(e)}function M(e,t){return`${nt(e)} / ${at(t)}`}function D(e){return e.map(t=>`<option value="${t.value}">${t.label}</option>`).join("")}function G(e,t){return e.length===0?`<li class="py-3 text-sm text-stone-400">${t}</li>`:e.map(({label:n,count:a})=>`
        <li class="flex items-center justify-between border-b border-stone-800 py-3 text-sm text-stone-200 last:border-b-0">
          <span>${n}</span>
          <span class="font-semibold text-amber-200">${a}</span>
        </li>
      `).join("")}function T(e,t,n){if(e.length===0)return`<p class="text-xs text-stone-400">${t}</p>`;const a=e.reduce((o,r)=>o+r.value,0);return`
    <div class="space-y-2" role="img" aria-label="Mini chart">
      ${e.map(o=>{const r=a===0?0:o.value/a*100,l=`${r.toFixed(1)}%`;return`
            <div class="grid grid-cols-[72px_1fr_auto] items-center gap-2 text-xs">
              <span class="text-stone-400">${o.label}</span>
              <div class="h-2 rounded-full bg-stone-800">
                <div class="h-2 rounded-full bg-amber-400/80" style="width: ${r}%;"></div>
              </div>
              <span class="text-amber-200">${l}</span>
            </div>
            <div class="-mt-1 grid grid-cols-[72px_1fr_auto] items-center gap-2 text-[11px]">
              <span></span>
              <span></span>
              <span class="text-stone-500">${n(o)}</span>
            </div>
          `}).join("")}
    </div>
  `}function J(e){return Array.from(new Set(e.map(t=>t.timestamp.toISOString().slice(0,10)))).sort((t,n)=>t.localeCompare(n))}const Le=["Spill","Comp","RnD","Family Meal","Staff Discount","Rewards Discount"];function st(e){switch(e){case"Damage":case"Cooking error":return"Spill";case"Customer return":return"Comp";case"Expired":return"RnD";case"Other":return"Family Meal";default:return"RnD"}}function ot(e){const t=new Map(Le.map(n=>[n,0]));return e.forEach(n=>{const a=st(n.reason);t.set(a,(t.get(a)??0)+1)}),Le.map(n=>({label:n,count:t.get(n)??0}))}function it(){var xe,Ce,Se;const e=document.getElementById("operations-sandbox");if(!e)return;const t=new Map(L.map(s=>[s.id,s.name])),n=new Map(C.map(s=>[s.id,s.name])),a=Array.from(new Set(y.map(s=>s.timestamp.toISOString().slice(0,10)))).sort((s,c)=>s.localeCompare(c)),o=Array.from(new Set(L.map(s=>s.country))).sort((s,c)=>s.localeCompare(c)),r=[{value:"all",label:"All locations"},...L.map(s=>({value:s.id,label:`${s.name} (${s.city})`}))],l=[{value:"all",label:"All products"},...C.map(s=>({value:s.id,label:s.name}))],b=[{value:"all",label:"All days"},...a.map(s=>({value:s,label:s}))],v=[{value:"all",label:"All validations"},{value:"locations",label:"Locations"},{value:"sales",label:"Sales"},{value:"waste",label:"Waste"},{value:"menu",label:"Menu"}],R=[{value:"all",label:"All categories"},...Array.from(new Set(C.map(s=>s.category))).map(s=>({value:s,label:s}))],F=[{value:"all",label:"All markets"},...o.map(s=>({value:s,label:s}))],$=Y({locations:L,menuItems:C,sales:y,wasteRecords:E,exchangeRates:W,currency:"USD"}),m=Y({locations:L,menuItems:C,sales:y,wasteRecords:E,exchangeRates:W,currency:"COP"}),I=et({locations:L,employees:[],inventoryItems:[],loyaltyMembers:[],menuItems:C,sales:y,wasteRecords:E,exchangeRates:W}),V=we(y,(s,c)=>s.timestamp.toISOString().localeCompare(c.timestamp.toISOString())),Ue=Fe(y,{locationId:"LOC-MEDELLIN-01",menuItemId:"menu-churrasco",soldOn:"2026-08-06"}),Ne=Ve(V,"2026-08-07");De({locations:L,sales:y,menuItems:C});const Ee=s=>s.startsWith("LOC-")?"locations":s.startsWith("TXN-")?"sales":s.startsWith("WASTE-")?"waste":s.startsWith("menu-")?"menu":"all";e.innerHTML=`
    <div class="grid gap-5 lg:grid-cols-3">
      <article class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <div class="flex items-end justify-between gap-4">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Revenue (USD / COP)</p>
          <label class="text-xs text-stone-400">
            Location
            <select id="revenue-location-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${D(r)}
            </select>
          </label>
        </div>
        <p id="revenue-value" class="mt-3 font-display text-3xl text-white">${M($.totals.revenue,m.totals.revenue)}</p>
        <p id="revenue-detail" class="mt-2 text-sm text-stone-300"></p>
        <div id="revenue-trend" class="mt-4"></div>
      </article>

      <article class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <div class="flex items-end justify-between gap-4">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Margin (USD / COP)</p>
          <label class="text-xs text-stone-400">
            Product
            <select id="margin-product-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${D(l)}
            </select>
          </label>
        </div>
        <p id="margin-value" class="mt-3 font-display text-3xl text-white">${M($.totals.margin,m.totals.margin)}</p>
        <p id="margin-detail" class="mt-2 text-sm text-stone-300"></p>
        <div id="margin-trend" class="mt-4"></div>
      </article>

      <article class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <div class="flex items-end justify-between gap-4">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Validation Issues</p>
          <label class="text-xs text-stone-400">
            Scope
            <select id="validation-scope-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${D(v)}
            </select>
          </label>
        </div>
        <p id="validation-value" class="mt-3 font-display text-3xl text-white">${I.length}</p>
        <p id="validation-detail" class="mt-2 text-sm text-stone-300"></p>
      </article>
    </div>

    <div class="mt-8 grid gap-5 lg:grid-cols-2">
      <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <div class="flex items-end justify-between gap-4">
          <h3 class="font-display text-2xl text-white">Sales By Payment Method</h3>
          <label class="text-xs text-stone-400">
            Location
            <select id="payment-location-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${D(r)}
            </select>
          </label>
        </div>
        <ul id="payment-list" class="mt-4"></ul>
        <div id="payment-trend" class="mt-4"></div>
      </section>

      <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <div class="flex items-end justify-between gap-4">
          <h3 class="font-display text-2xl text-white">Product Loss</h3>
          <label class="text-xs text-stone-400">
            Location
            <select id="waste-location-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${D(r)}
            </select>
          </label>
        </div>
        <ul id="waste-list" class="mt-4"></ul>
        <div id="waste-trend" class="mt-4"></div>
      </section>
    </div>

    <div class="mt-8 grid gap-5 lg:grid-cols-2">
      <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <div class="flex items-end justify-between gap-4">
          <h3 class="font-display text-2xl text-white">Location Performance Scores</h3>
          <label class="text-xs text-stone-400">
            Market
            <select id="performance-country-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${D(F)}
            </select>
          </label>
        </div>
        <ul id="performance-list" class="mt-4"></ul>
        <div id="performance-trend" class="mt-4"></div>
      </section>

      <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <h3 class="font-display text-2xl text-white">Waste Snapshot</h3>
        <label class="mt-2 block text-xs text-stone-400">
          Location
          <select id="waste-snapshot-location-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
            ${D(r)}
          </select>
        </label>
        <ul id="waste-snapshot-list" class="mt-4 space-y-3 text-sm text-stone-200"></ul>
      </section>
    </div>

    <div class="mt-8 grid gap-5 lg:grid-cols-2">
      <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <h3 class="font-display text-2xl text-white">Collection Management Checks</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          <label class="text-xs text-stone-400">
            Location
            <select id="checks-location-select" class="mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${D(r)}
            </select>
          </label>
          <label class="text-xs text-stone-400">
            Product
            <select id="checks-product-select" class="mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${D(l)}
            </select>
          </label>
          <label class="text-xs text-stone-400">
            Date
            <select id="checks-date-select" class="mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
              ${D(b)}
            </select>
          </label>
        </div>
        <dl id="checks-details" class="mt-4 space-y-3 text-sm text-stone-200"></dl>
        <div id="checks-trend" class="mt-4"></div>
      </section>

      <section class="rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
        <h3 class="font-display text-2xl text-white">Operational Highlights</h3>
        <ul class="mt-4 space-y-3 text-sm text-stone-200">
          <li>Linear sales search: <span class="font-semibold text-amber-200">${((xe=Ue.item)==null?void 0:xe.id)??"Not found"}</span></li>
          <li>Binary date search: <span class="font-semibold text-amber-200">${((Ce=Ne.item)==null?void 0:Ce.id)??"Not found"}</span></li>
          <li>Top revenue location: <span class="font-semibold text-amber-200">${((Se=$.topLocation)==null?void 0:Se.locationName)??"None"}</span></li>
        </ul>
      </section>
    </div>

    <div class="mt-8 rounded-xl border border-stone-700 bg-stone-900/80 p-5 shadow-lg">
      <div class="flex items-end justify-between gap-4">
        <h3 class="font-display text-2xl text-white">Aggregated Product Report</h3>
        <label class="text-xs text-stone-400">
          Category
          <select id="product-category-select" class="ml-2 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200">
            ${D(R)}
          </select>
        </label>
      </div>
      <ul id="product-report-list" class="mt-4 grid gap-3 md:grid-cols-2"></ul>
    </div>
  `;const te=document.getElementById("revenue-location-select"),ne=document.getElementById("margin-product-select"),ae=document.getElementById("validation-scope-select"),se=document.getElementById("payment-location-select"),oe=document.getElementById("waste-location-select"),ie=document.getElementById("performance-country-select"),re=document.getElementById("waste-snapshot-location-select"),le=document.getElementById("checks-location-select"),ce=document.getElementById("checks-product-select"),de=document.getElementById("checks-date-select"),ue=document.getElementById("product-category-select"),me=()=>{const s=te.value,c=s==="all"?y:X(y,s),f=c.reduce((x,h)=>x+h.totalPrice.USD,0),d=c.reduce((x,h)=>x+h.totalPrice.COP,0),p=c.length===0?0:f/c.length,u=c.length===0?0:d/c.length,O=s==="all"?"all locations":t.get(s)??s,g=document.getElementById("revenue-value"),U=document.getElementById("revenue-detail"),N=document.getElementById("revenue-trend");if(g&&U&&(g.textContent=M(f,d),U.textContent=`${c.length} transactions in ${O}. Avg ticket ${M(p,u)}.`),N){const h=J(c).map(S=>{const k=c.filter(P=>P.timestamp.toISOString().slice(0,10)===S).reduce((P,Z)=>P+Z.totalPrice.USD,0),q=c.filter(P=>P.timestamp.toISOString().slice(0,10)===S).reduce((P,Z)=>P+Z.totalPrice.COP,0);return{label:S.slice(5),value:k,secondaryValue:q}});N.innerHTML=T(h,"No daily revenue trend for this filter.",S=>M(S.value,S.secondaryValue??0))}},pe=()=>{const s=ne.value,c=s==="all"?y:Oe(y,s),f=A(c,C,"USD"),d=A(c,C,"COP"),p=c.reduce((N,x)=>N+x.quantity,0),u=s==="all"?"all products":n.get(s)??s,O=document.getElementById("margin-value"),g=document.getElementById("margin-detail"),U=document.getElementById("margin-trend");if(O&&g&&(O.textContent=M(f.margin,d.margin),g.textContent=`${p} units sold for ${u}. Margin ${f.marginPercentage.toFixed(1)}%.`),U){const x=J(c).map(h=>{const S=c.filter(P=>P.timestamp.toISOString().slice(0,10)===h),k=A(S,C,"USD").margin,q=A(S,C,"COP").margin;return{label:h.slice(5),value:k,secondaryValue:q}});U.innerHTML=T(x,"No daily margin trend for this filter.",h=>M(h.value,h.secondaryValue??0))}},fe=()=>{const s=ae.value,c=s==="all"?I:I.filter(p=>Ee(p.entityName)===s),f=document.getElementById("validation-value"),d=document.getElementById("validation-detail");f&&d&&(f.textContent=String(c.length),d.textContent=c.length===0?"No issues found for this validation scope.":`First issue: ${c[0].field} on ${c[0].entityName}.`)},ge=()=>{const s=se.value,c=s==="all"?y:X(y,s),f=tt(Y({locations:L,menuItems:C,sales:c,wasteRecords:E,exchangeRates:W,currency:"USD"}).salesByPaymentMethod).map(u=>({label:String(u.label),count:u.count})),d=document.getElementById("payment-list"),p=document.getElementById("payment-trend");d&&(d.innerHTML=G(f,"No sales for this location filter.")),p&&(p.innerHTML=T(f.map(u=>({label:u.label,value:u.count})),"No payment-method distribution for this filter.",u=>`${u.value}`))},he=()=>{const s=oe.value,c=s==="all"?E:E.filter(u=>u.locationId===s),f=ot(c).map(u=>({label:String(u.label),count:u.count})),d=document.getElementById("waste-list"),p=document.getElementById("waste-trend");d&&(d.innerHTML=G(f,"No product loss records for this location filter.")),p&&(p.innerHTML=T(f.map(u=>({label:u.label,value:u.count})),"No product-loss trend for this filter.",u=>`${u.value}`))},ye=()=>{const s=ie.value,c=s==="all"?L:L.filter(g=>g.country===s),f=new Set(c.map(g=>g.id)),d=y.filter(g=>f.has(g.locationId)),p=De({locations:c,sales:d,menuItems:C}).map(g=>({label:g.locationName,count:g.score})),u=document.getElementById("performance-list"),O=document.getElementById("performance-trend");u&&(u.innerHTML=G(p,"No locations available for this market filter.")),O&&(O.innerHTML=T(p.map(g=>({label:g.label.slice(0,10),value:g.count})),"No performance comparison for this filter.",g=>`${g.value}`))},be=()=>{const s=re.value,c=s==="all"?E:E.filter(u=>u.locationId===s),f=_(c,"USD"),d=_(c,"COP"),p=document.getElementById("waste-snapshot-list");p&&(p.innerHTML=`
        <li>Total waste records: <span class="font-semibold text-amber-200">${c.length}</span></li>
        <li>Total waste cost: <span class="font-semibold text-amber-200">${M(f,d)}</span></li>
      `)},H=()=>{const s=le.value,c=ce.value,f=de.value;let d=s==="all"?y:X(y,s);c!=="all"&&(d=Oe(d,c)),f!=="all"&&(d=je(d,{startDate:f,endDate:f}));const p=d.reduce((x,h)=>x+h.totalPrice.USD,0),O=d.reduce((x,h)=>x+h.totalPrice.COP,0)||ze(p,"USD","COP",W),g=d.reduce((x,h)=>x+h.quantity,0),U=document.getElementById("checks-details"),N=document.getElementById("checks-trend");if(U&&(U.innerHTML=`
        <div class="flex items-start justify-between gap-4">
          <dt>Matched transactions</dt>
          <dd class="text-right text-amber-200">${d.length}</dd>
        </div>
        <div class="flex items-start justify-between gap-4">
          <dt>Total units sold</dt>
          <dd class="text-right text-amber-200">${g}</dd>
        </div>
        <div class="flex items-start justify-between gap-4">
          <dt>Total revenue (USD / COP)</dt>
          <dd class="text-right text-amber-200">${M(p,O)}</dd>
        </div>
      `),N){const h=J(d).map(S=>{const k=d.filter(q=>q.timestamp.toISOString().slice(0,10)===S).length;return{label:S.slice(5),value:k}});N.innerHTML=T(h,"No transaction-volume trend for this filter.",S=>`${S.value}`)}},ve=()=>{const s=ue.value,f=(s==="all"?C:C.filter(p=>p.category===s)).map(p=>{const u=y.filter(O=>O.itemId===p.id).reduce((O,g)=>O+g.quantity,0);return`
          <li class="flex items-center justify-between rounded-lg border border-stone-800 px-4 py-3 text-sm text-stone-200">
            <span>${p.name}</span>
            <span class="font-semibold text-amber-200">${u} units</span>
          </li>
        `}).join(""),d=document.getElementById("product-report-list");d&&(d.innerHTML=f||'<li class="py-3 text-sm text-stone-400">No products in this category.</li>')};te.addEventListener("change",me),ne.addEventListener("change",pe),ae.addEventListener("change",fe),se.addEventListener("change",ge),oe.addEventListener("change",he),ie.addEventListener("change",ye),re.addEventListener("change",be),le.addEventListener("change",H),ce.addEventListener("change",H),de.addEventListener("change",H),ue.addEventListener("change",ve),me(),pe(),fe(),ge(),he(),ye(),be(),H(),ve()}it();
