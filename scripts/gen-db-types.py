#!/usr/bin/env python3
"""Genera app/types/database.ts (formato compatible con supabase-js) leyendo
el catálogo de una BD PostgreSQL con las migraciones aplicadas.
Uso: python3 scripts/gen-db-types.py "postgresql://..."  (o variables PG*)
En un proyecto Supabase real también se puede usar: npx supabase gen types typescript"""
import json, subprocess, sys

def q(sql):
    args = ["psql", "-tAX", "-c", sql]
    if len(sys.argv) > 1: args.insert(1, sys.argv[1])
    out = subprocess.check_output(args, text=True)
    return [json.loads(l) for l in out.splitlines() if l.strip()]

enums = {r["n"]: r["v"] for r in q("""select json_build_object('n',t.typname,'v',json_agg(e.enumlabel order by e.enumsortorder))
  from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' group by t.typname""")}

def ts(udt, dtype, nullable):
    base = udt.lstrip("_")
    m = {"uuid":"string","text":"string","citext":"string","varchar":"string","date":"string","timestamptz":"string","timestamp":"string",
         "int2":"number","int4":"number","int8":"number","numeric":"number","float8":"number","float4":"number","bool":"boolean",
         "jsonb":"Json","json":"Json"}
    t = m.get(base) or (f'Database["public"]["Enums"]["{base}"]' if base in enums else "unknown")
    if udt.startswith("_"): t = f"({t})[]"
    return t + (" | null" if nullable else "")

cols = q("""select json_build_object('t',c.table_name,'c',c.column_name,'u',c.udt_name,'d',c.data_type,'n',c.is_nullable='YES',
  'def',c.column_default is not null or c.is_identity='YES','gen',c.is_generated='ALWAYS' or c.identity_generation='ALWAYS','k',tb.table_type)
  from information_schema.columns c join information_schema.tables tb on tb.table_name=c.table_name and tb.table_schema=c.table_schema
  where c.table_schema='public' order by c.table_name, c.ordinal_position""")
tables, views = {}, {}
for c in cols:
    (views if c["k"] == "VIEW" else tables).setdefault(c["t"], []).append(c)

rels = {}
for r in q("""select json_build_object('name',c.conname,'t',cl.relname,'cols',(select json_agg(a.attname order by k.o) from unnest(c.conkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.n),
  'ref',rc.relname,'rcols',(select json_agg(a.attname order by k.o) from unnest(c.confkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.n),
  'one',exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indisunique and i.indkey::int2[] @> c.conkey and array_length(i.indkey::int2[],1)=array_length(c.conkey,1)))
  from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_class rc on rc.oid=c.confrelid join pg_namespace n on n.oid=cl.relnamespace join pg_namespace rn on rn.oid=rc.relnamespace
  where c.contype='f' and n.nspname='public' and rn.nspname='public'"""):
    rels.setdefault(r["t"], []).append(r)

fns = q("""select json_build_object('name',p.proname,'args',coalesce((select json_agg(json_build_object('n',a.n,'t',a.t,'def',a.ord>p.pronargs-p.pronargdefaults) order by a.ord)
  from unnest(p.proargnames[1:p.pronargs], (p.proargtypes::oid[])) with ordinality as a(n,t,ord)),'[]'),
  'ret',format_type(p.prorettype,null),'set',p.proretset)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'""")

def fmt_type(t):
    t = t.replace("public.", "")
    arr = t.endswith("[]"); base = t[:-2] if arr else t
    m = {"uuid":"string","text":"string","boolean":"boolean","jsonb":"Json","void":"undefined","numeric":"number","integer":"number"}
    if base in m: r = m[base]
    elif base in enums: r = f'Database["public"]["Enums"]["{base}"]'
    elif base in tables: r = f'Database["public"]["Tables"]["{base}"]["Row"]'
    else: r = "unknown"
    return f"{r}[]" if arr else r

def oid_name(oid):
    return q(f"select to_json(format_type({oid},null))")[0]

L = ["// Archivo generado por scripts/gen-db-types.py — no editar a mano.",
     "export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];", "",
     "export type Database = {", "  public: {", "    Tables: {"]
for t, cs in tables.items():
    L.append(f"      {t}: {{")
    L.append("        Row: {" + " ".join(f"{c['c']}: {ts(c['u'],c['d'],c['n'])};" for c in cs) + " };")
    L.append("        Insert: {" + " ".join(f"{c['c']}{'?' if (c['n'] or c['def']) else ''}: {ts(c['u'],c['d'],c['n'])};" for c in cs if not c['gen']) + " };")
    L.append("        Update: {" + " ".join(f"{c['c']}?: {ts(c['u'],c['d'],c['n'])};" for c in cs if not c['gen']) + " };")
    rs = rels.get(t, [])
    L.append("        Relationships: [" + ", ".join(
        f'{{ foreignKeyName: "{r["name"]}"; columns: {json.dumps(r["cols"])}; isOneToOne: {str(r["one"]).lower()}; referencedRelation: "{r["ref"]}"; referencedColumns: {json.dumps(r["rcols"])} }}'
        for r in rs) + "];")
    L.append("      };")
L += ["    };", "    Views: {"]
for t, cs in views.items():
    L.append(f"      {t}: {{ Row: {{" + " ".join(f"{c['c']}: {ts(c['u'],c['d'],True)};" for c in cs) + " }; Relationships: [] };")
L += ["    };", "    Functions: {"]
for f in sorted(fns, key=lambda f: f["name"]):
    args = " ".join(f"{a['n']}{'?' if a['def'] else ''}: {fmt_type(oid_name(a['t']))};" for a in f["args"])
    ret = fmt_type(f["ret"]) + ("[]" if f["set"] else "")
    L.append(f"      {f['name']}: {{ Args: {{ {args} }}; Returns: {ret} }};")
L += ["    };", "    Enums: {"]
for n, v in enums.items():
    L.append(f"      {n}: " + " | ".join(json.dumps(x) for x in v) + ";")
L += ["    };", "    CompositeTypes: Record<string, never>;", "  };", "};", "",
      'export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];',
      'export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];', ""]
open("app/types/database.ts", "w").write("\n".join(L))
print(f"{len(tables)} tablas, {len(views)} vistas, {len(fns)} funciones")
