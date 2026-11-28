import {useRef,useState} from 'react';
import {Sheet} from './design';
import {backupLimit,readProfilesBackup,type ProfileDirectory} from './store';
import {dateKey} from './profile';

export function ProfileManager({directory,close,act,exportOne}:{directory:ProfileDirectory;close:()=>void;
  act:(action:'新建'|'切换'|'编辑'|'删除',id?:string)=>Promise<void>;exportOne:(id:string)=>void}) {
  const [deleting,setDeleting]=useState<ProfileDirectory['profiles'][number]>();
  const [busy,setBusy]=useState(false);
  const pending=useRef(false);
  async function run(action:Parameters<typeof act>[0],id?:string) {
    if(pending.current)return;
    pending.current=true;setBusy(true);
    try{await act(action,id);}finally{setBusy(false);pending.current=false;}
  }
  return <Sheet title="档案管理" close={close}>
    <p className="meta">每个档案独立保存食谱、采购、价格和库存。外观由本机共同使用。</p>
    <button className="primary" disabled={busy} onClick={()=>void run('新建')}>新建档案</button>
    <ul className="profile-list">
      {directory.profiles.map(({id,name,createdAt,current,target,goal})=><li key={id}>
        <strong>{name}</strong>{id===directory.activeProfileId&&<span className="meta"> · 使用中</span>}
        <p className="meta">{goal} · {current===null?'体重未填写':current+' 千克'}{target===null?'':' · 目标 '+target+' 千克'} · {createdAt.slice(0,10)} · {id.slice(0,8)}</p>
        <div className="actions">
          {id!==directory.activeProfileId&&<button disabled={busy} onClick={()=>void run('切换',id)}>切换到{name}</button>}
          <button disabled={busy} onClick={()=>void run('编辑',id)}>编辑{name}</button>
          <button disabled={busy} onClick={()=>exportOne(id)}>导出{name}</button>
          <button className="danger" disabled={busy} onClick={()=>setDeleting(directory.profiles.find(p=>p.id===id))}>删除{name}</button>
        </div>
      </li>)}
    </ul>
    {deleting&&<Sheet kind="dialog" title="删除指定档案" close={()=>setDeleting(undefined)}>
      <p>将永久删除「{deleting.name}」（{deleting.id.slice(0,8)}）的称重、食谱、库存及购买记录。</p>
      <button onClick={()=>exportOne(deleting.id)}>先导出备份</button>
      <button onClick={()=>setDeleting(undefined)}>取消删除</button>
      <button className="danger" disabled={busy} onClick={()=>void run('删除',deleting.id).then(()=>setDeleting(undefined))}>确认删除档案</button>
    </Sheet>}
  </Sheet>;
}

type Backup=ReturnType<typeof readProfilesBackup>;
export function BackupImport({directory,close,restore}:{directory:ProfileDirectory;close:()=>void;
  restore:(backup:Backup,mode:'新建'|'覆盖'|'合并'|'全部替换',id?:string)=>Promise<void>}) {
  const [backup,setBackup]=useState<Backup>(),[target,setTarget]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const full=backup?.kind==='天天减全部档案';
  async function importFile(file:File) {
    setBackup(undefined);setTarget('');setError('');
    try {
      if(file.size>backupLimit)throw Error('备份文件过大。');
      setBackup(readProfilesBackup(await file.text(),dateKey()));
    } catch(e){setError(e instanceof Error?e.message:'无法读取备份。');}
  }
  async function apply(mode:'新建'|'覆盖'|'合并'|'全部替换') {
    if(!backup||busy)return;
    if(mode==='覆盖'&&!confirm('确认覆盖所选档案及其全部记录？'))return;
    if(mode==='全部替换'&&!confirm('确认替换本机所有档案和公共外观？'))return;
    setBusy(true);
    try{await restore(backup,mode,target);}finally{setBusy(false);}
  }
  return <Sheet title="导入并恢复" close={close}>
    <label className="field">选择备份文件<input type="file" aria-label="选择备份文件" accept=".json,application/json" disabled={busy}
      onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);}}/></label>
    {error&&<p role="alert">{error}</p>}
    {backup&&<><p>已检查 {backup.profiles.length} 个档案。</p>
      {full?<><p className="meta">合并时跳过相同档案编号，库存和流水按原档案保存。</p>
        <button disabled={busy} className="primary" onClick={()=>void apply('合并')}>合并档案</button>
        <button disabled={busy} className="danger" onClick={()=>void apply('全部替换')}>替换全部档案</button>
      </>:<>
        <button disabled={busy} className="primary" onClick={()=>void apply('新建')}>恢复为新档案</button>
        <label className="field">覆盖指定档案<select value={target} onChange={e=>setTarget(e.target.value)}>
          <option value="">选择档案</option>{directory.profiles.map(p=><option key={p.id} value={p.id}>{p.name} · {p.id.slice(0,8)}</option>)}</select></label>
        <button disabled={busy||!target} className="danger" onClick={()=>void apply('覆盖')}>覆盖指定档案</button>
      </>}</>}
  </Sheet>;
}
