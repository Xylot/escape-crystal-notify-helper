export class Store {
  constructor(db) { this.db=db; }
  async put(table,id,data,expires){await this.db.prepare(`INSERT OR REPLACE INTO ${this.table(table)} (id,data,expires) VALUES (?,?,?)`).bind(id,JSON.stringify(data),expires).run();}
  table(name){if(!['sessions'].includes(name))throw Error('Invalid table');return name;}
  async session(id){const r=await this.db.prepare('SELECT data FROM sessions WHERE id=? AND expires>?').bind(id,Date.now()).first();return r?JSON.parse(r.data):null;}
  async deleteSession(id){await this.db.prepare('DELETE FROM sessions WHERE id=?').bind(id).run();}
  async flow(state,data,expires){await this.db.prepare('INSERT INTO oauth_flows (state,data,expires) VALUES (?,?,?)').bind(state,JSON.stringify(data),expires).run();}
  async consumeFlow(state){const r=await this.db.prepare('DELETE FROM oauth_flows WHERE state=? AND expires>? RETURNING data').bind(state,Date.now()).first();return r?JSON.parse(r.data):null;}
  async create(record){await this.db.prepare('INSERT OR IGNORE INTO submissions (id,owner,fingerprint,revision,data,expires) VALUES (?,?,?,?,?,?)').bind(record.id,record.owner,record.fingerprint,record.revision,JSON.stringify(record),Date.now()+30*86400000).run();return this.byFingerprint(record.owner,record.fingerprint);}
  async completed(owner,revision){const rows=await this.db.prepare('SELECT data FROM submissions WHERE owner=? AND revision=?').bind(owner,revision).all();return rows.results.map(r=>JSON.parse(r.data)).find(r=>r.pr)??null;}
  async byFingerprint(owner,fingerprint){const r=await this.db.prepare('SELECT data FROM submissions WHERE owner=? AND fingerprint=?').bind(owner,fingerprint).first();return r?JSON.parse(r.data):null;}
  async get(id,owner){const r=await this.db.prepare('SELECT data FROM submissions WHERE id=? AND owner=?').bind(id,owner).first();return r?JSON.parse(r.data):null;}
  async save(record){await this.db.prepare('UPDATE submissions SET data=?,expires=?,lease=CASE WHEN lease>0 THEN ? ELSE 0 END WHERE id=? AND owner=?').bind(JSON.stringify(record),Date.now()+30*86400000,Date.now()+120000,record.id,record.owner).run();}
  async lock(id){const r=await this.db.prepare('UPDATE submissions SET lease=? WHERE id=? AND lease<? RETURNING id').bind(Date.now()+120000,id,Date.now()).first();return !!r;}
  async unlock(id){await this.db.prepare('UPDATE submissions SET lease=0 WHERE id=?').bind(id).run();}
  async rate(id,maximum){const row=await this.db.prepare('INSERT INTO limits (id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(id,Date.now()+3600000).first();return row.count<=maximum;}
  async cleanup(){await this.db.batch(['oauth_flows','sessions','limits'].map(table=>this.db.prepare(`DELETE FROM ${table} WHERE expires<?`).bind(Date.now())));}
}
