import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import RichTextEditor from '../../../src/components/common/RichTextEditor.jsx';
import AgreementDocument from '../../../src/components/agreements/AgreementDocument.jsx';
import '../../../src/index.css';
window.attackCount=0;
const payload='<h2>Rental agreement</h2><p style="text-align:center"><strong>Preserved legal wording</strong></p><table><tbody><tr><td>Rent</td><td>500</td></tr></tbody></table><img src="/missing-security-image" onerror="window.attackCount++"><svg onload="window.attackCount++"></svg><a href="javascript:window.attackCount++">unsafe link</a><iframe srcdoc="<script>parent.attackCount++</script>"></iframe><script>window.attackCount++</script>';
const screen=new URLSearchParams(location.search).get('screen');
function Fixture(){
 const [html,setHtml]=useState(payload);window.updateSecurityContent=setHtml;
 return <main className="mx-auto max-w-4xl p-5"><h1 className="mb-5 text-2xl font-bold">Agreement formatting verification</h1>
 {screen==='document'?<AgreementDocument documentUrl={html} title="Rental agreement" onClose={()=>{}}/>:<RichTextEditor initialContent={html} readonly/>}</main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
