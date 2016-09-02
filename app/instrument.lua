local HUGE_VAL = 1000000000

local bc  = require('jit.bc')
local jutil = require('jit.util')
local jdump = require('jit.dump')

local bcline, bctargets = bc.line, bc.targets
local funcinfo, funck = jutil.funcinfo, jutil.funck
local traceinfo, funcbc = jutil.traceinfo, jutil.funcbc
local gsub, fmt, gmatch = string.gsub, string.format, string.gmatch
local find, sub = string.find, string.sub
local insert, concat = table.insert, table.concat
local band = bit.band

-- JSON
local __json_array__ = {}
local __json_map__ = {}
local __json_null__ = {}; setmetatable(__json_null__, __json_null__)

local function json_array(a, len)
    for i = 1,len or 0 do
        if a[i] == nil then a[i] = __json_null__ end
    end
    return setmetatable(a or {}, __json_array__)    
end
local function json_map(m) return setmetatable(m or {}, __json_map__) end

-- (after JSON decode) " -> ", \ -> \\, NL -> \n, \? -> \\?
local _json_str_esc_map = { ['\\"'] = '\\"', ['\\\\'] = '\\\\\\\\', ['\\\n'] = '\\\\n' }
local function _json_str_esc(s) return _json_str_esc_map[s] or '\\'..s end
local function _json_str(str)
    return (gsub(fmt('%q',str), '\\.', _json_str_esc))
end
local _json_append_thing
local function json_unparse(thing)
    local chunks = {}
    _json_append_thing(chunks, thing)
    insert(chunks, '\n')
    return concat(chunks, '')
end
_json_append_thing = function(chunks, thing)
    local t = type(thing)
    if t == 'table' then
        local mt = getmetatable(thing)
        if mt == __json_array__ then
            insert(chunks, '[')
            for i = 1,HUGE_VAL do
                local next_thing = thing[i]
                if not next_thing then break end
                if i ~= 1 then insert(chunks, ',') end
                _json_append_thing(chunks, next_thing)
            end
            insert(chunks, ']')
        elseif mt == __json_map__ then
            insert(chunks, '{')
            local k
            while true do
                local next_k, next_thing = next(thing, k)
                if not next_k then break end
                insert(chunks, fmt('%s%s:', k and ',' or '', _json_str(tostring(next_k))))
                _json_append_thing(chunks, next_thing)
                k = next_k
            end
            insert(chunks, '}')
        elseif mt == __json_null__ then
            insert(chunks, 'null')
        else
            error("Can't do thing")
        end
    elseif t == 'string' then
        insert(chunks, _json_str(thing))
    else
        insert(chunks, tostring(thing))
    end
end

-- FUNC dissector

local _dissect
_dissect = function(func, res, M)
    local bc_map = json_array()
    local bc = json_array()
    local k_number, k_gc = json_array(), json_array()
    local proto_pos = #res + 1
    local info = funcinfo(func)
    M[info.proto or info.linedefined] = proto_pos
    res[proto_pos] = json_map({
        src_range = json_array({info.linedefined, info.lastlinedefined}, 2),
        bc        = bc,
        bc_map    = bc_map,
        k_number  = k_number,
        k_gc      = k_gc,
        n_slots   = info.stackslots,
        n_params  = info.params,
        n_params  = info.isvararg and '...' or info.params,
        extra     = json_map(info)
    })
    for i = 1,HUGE_VAL do
        local code = bcline(func, i)
        if not code then break end
        bc[i] = gsub(code, '%d+%s*(.*)\n', '%1') -- strip
        bc_map[i] = funcinfo(func,i).currentline
    end
    for i = 0, HUGE_VAL do
        local k = funck(func, i)
        if not k then break end
        k_number[i+1] = k
    end
    for i = -1,-HUGE_VAL,-1 do
        local k = funck(func, i)
        if not k then break end
        local t = type(k)
        if t == 'proto' then
            k_gc[-i] = _dissect(k, res, M)
        elseif t == 'table' then
            local items = {}
            for k, v in pairs(k) do
                if type(k) == 'string' then k = fmt('%q', k) end
                if type(v) == 'string' then v = fmt('%q', v) end
                insert(items, fmt('[%s] = %s', k, v))
            end
            k_gc[-i] = '{'..concat(items, ', ')..'}'
        elseif t == 'string' then
            k_gc[-i] = fmt('%q', k)
        else
            k_gc[-i] = tostring(k)
        end
    end
    return json_map({['$func$'] = proto_pos})
end
local function dissect(root)
    local res, M = json_array(), {}
    _dissect(root, res, M)
    return res, M
end

local function upmap(func)
    local map = {}
    for i = 1,HUGE_VAL do
        local k, v = debug.getupvalue(func, i)
        if not k then break end
        map[k] = i
        map[i] = v
    end
    return map
end

local function split(str, pattern)
    pattern = pattern or '\n'
    local res, n, p = {}, 0, 0
    while true do
        local a, b = find(str, pattern, p + 1)
        if not a then
            res[n+1] = sub(str, p+1); break
        end
        res[n+1] = sub(str, p+1, a-1)
        n = n + 1
        p = b
    end
    return res
end

local __out__ = { __index = { flush = function() end, close = function() end } }

local function run_code(source, ...)
    local traces = json_array({})
    local result, M = json_map({source = json_array(split(source)), traces = traces})
    local code, err = loadstring(source, '@<source>')
    if not code then
        result.error = err; return json_unparse(result)
    end
    result.protos, M = dissect(code)
    local dump_texit, dump_record, dump_trace, fmterr
    local out = setmetatable({
        write = function(self, ...)
            local chunks = self.chunks
            if chunks then
                local n = #chunks
                for i = 1,select('#',...) do
                    chunks[n+i] = select(i, ...)
                end
            end
        end
    }, __out__)
    local t_by_tr = {}
    local cur_trace, cur_trace_trace
    local function my_dump_trace(what, tr, func, pc, otr, oex)
        if     what == 'start' then
            local id = #traces + 1
            cur_trace_trace = json_array()
            cur_trace = json_map({
                luajit_id = tr,
                trace = cur_trace_trace,
                parent = t_by_tr[otr],
                parent_exit = oex
            })
            traces[id] = cur_trace 
            t_by_tr[tr] = id
            dump_trace(what, tr, func, pc, otr, oex)
        elseif what == 'stop' then
            local info = traceinfo(tr)
            cur_trace.target = t_by_tr[info.link]
            cur_trace.link_type = info.linktype
            local chunks = {}; out.chunks = chunks
            dump_trace(what, tr, func, pc, otr, oex)
            out.chunks = nil
            local ir_and_asm = split(concat(chunks, ''), '---- TRACE %d[^\n]*\n')
            local ir = split(ir_and_asm[2]); ir[#ir] = nil
            for i,item in ipairs(ir) do ir[i] = sub(item, 6) end -- remove #### prefix
            local asm = split(ir_and_asm[3]); asm[#asm] = nil
            cur_trace.ir = json_array(ir)
            cur_trace.asm = json_array(asm)
        elseif what == 'abort' then
            cur_trace.aborted = true
            cur_trace.abort_reason = fmterr(otr, oex)
            dump_trace(what, tr, func, pc, otr, oex)
        elseif what == 'flush' then
            t_by_tr = {}
            dump_trace(what, tr, func, pc, otr, oex)
        else
            dump_trace(what, tr, func, pc, otr, oex)
        end
    end
    local function my_dump_record(tr, func, pc, depth, callee)
        if pc > 0 then
            local info = funcinfo(func)
            local proto = M[info.proto or info.linedefined] or ''
            insert(cur_trace_trace, fmt('BR%s:%d', proto, pc)) -- proto:bc (Bytecode Ref)
            if band(funcbc(func, pc), 0xff) < 16 then -- ORDER BC
                insert(cur_trace_trace, fmt('%s:%d:%d', proto, pc+1, depth))
                -- Write JMP for cond.
            end
        end
    end
    -- hack
    local io_open = io.open
    io.open = function() return out end
    jdump.on('tbim', '')
    io.open = io_open
    local um = upmap(jdump.start)
    dump_texit = assert(um[um.dump_texit])
    dump_record = assert(um[um.dump_record])
    dump_trace = assert(um[um.dump_trace])
    um = upmap(dump_trace)
    fmterr = assert(um[um.fmterr])
    jit.attach(my_dump_trace, 'trace')
    jit.attach(my_dump_record, 'record')
    local start_ts, ok, err = os.clock(), pcall(code, ...)
    local elapsed_time = os.clock() - start_ts
    jdump.off()
    jit.attach(my_dump_trace)
    jit.attach(my_dump_record)
    if not ok then result.error = tostring(err) end
    result.elapsed_time = elapsed_time
    return json_unparse(result)
end

local args = args or {'', ...}
local meta_fd = args and args[2] or '1'
local write
if meta_fd == '1' then
    write = function(str) io.stdout:write(str) end
else
    -- Can't reopen a fd that's already open (Linux).
    ffi = require('ffi')
    ffi.cdef('size_t write(int, const char *, size_t)')
    write = function(str) ffi.C.write(tonumber(meta_fd), str, #str) end
end
write(run_code(io.stdin:read('*a')))
