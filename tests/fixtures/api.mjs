export const snapshot = Object.fromEntries([...Array.from({
  length: 160
}, (_, i) => [`demo${String(i).padStart(7, '0')}`, {
  staked: (160 - i) * 200000,
  unstaked: i * 100
}]), ['audituser', {
  staked: 1000000,
  unstaked: 100
}], ['nextuser', {
  staked: 32000000,
  unstaked: 0
}], ['zerostaker', {
  staked: 0,
  unstaked: 25
}]]);
export const config = {
  rows: [{
    stakes: '257600000.0000 STRX',
    rewards: '100.0000 STRX',
    rewards_sec: '1.0000 STRX',
    pool_duration_months: 12,
    unstake_period_secs: 1209600,
    stake_plans: [],
    suspended: 0
  }]
};
export const sourceTime = '2026-10-20T00:00:00Z';
export const bridgeActions = Array.from({
  length: 650
}, (_, i) => ({
  global_sequence: String(100000 + i),
  timestamp: new Date(Date.parse(sourceTime) - i * 60000).toISOString(),
  '@timestamp': new Date(Date.parse(sourceTime) - i * 60000).toISOString(),
  trx_id: `synthetic-${i}`,
  act: {
    name: 'transfer',
    data: {
      from: i >= 350 && i < 390 ? 'audituser' : 'demowallet',
      to: 'bridge.strx',
      quantity: '10.0000 STRX',
      amount: 10,
      symbol: 'STRX',
      memo: 'STRX-SPL@synthetic-address'
    }
  }
}));
export function raydium({
  emptyApr = false,
  partial = false
} = {}) {
  const period = {
    volume: 100,
    apr: 2,
    feeApr: 2,
    rewardApr: emptyApr ? [] : [0],
    priceMin: 0.000008,
    priceMax: 0.000012
  };
  return {
    success: true,
    data: [{
      price: 0.00001,
      mintAmountA: 100,
      mintAmountB: 100,
      tvl: 10000,
      day: period,
      ...(partial ? {} : {
        week: period,
        month: period
      })
    }]
  };
}
export async function installApiFixtures(context, options = {}) {
  const requests = [];
  const blocked = [];
  await context.route('**/*', async route => {
    const req = route.request(),
      u = new URL(req.url());
    if (options.origin && u.origin === options.origin) return route.continue();
    const record = {
      url: u.origin + u.pathname,
      method: req.method(),
      body: req.postData(),
      query: Object.fromEntries(u.searchParams)
    };
    requests.push(record);
    if (req.resourceType() === 'image' || /\.(png|webp|svg|jpe?g|ico)$/i.test(u.pathname)) return route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#777"/></svg>'
    });
    let data, kind;
    if (u.hostname === 'nfts.jessytremblay.com' && u.pathname === '/STRX/stakes.json') {
      data = options.snapshot || snapshot;
      kind = 'snapshot';
    } else if (u.hostname === 'nfts.jessytremblay.com' && u.pathname === '/STRX/newstakers.json') {
      data = options.newStakers ?? [];
      kind = 'newStakers';
    } else if (['proton.eosusa.io', 'proton.greymass.com'].includes(u.hostname) && u.pathname === '/v1/chain/get_table_rows') {
      data = req.postDataJSON()?.table === 'config' ? (options.config ?? config) : {
        rows: [{
          sym: '4,STRX',
          quantity: '0.001000 USD'
        }]
      };
      kind = 'table';
    } else if (['proton.eosusa.io', 'proton.greymass.com'].includes(u.hostname) && u.pathname === '/v1/chain/get_currency_balance') {
      data = ['1000000.0000 STRX'];
      kind = 'balance';
    } else if (['proton.eosusa.io', 'proton.greymass.com'].includes(u.hostname) && u.pathname === '/v2/history/get_actions') {
      const skip = Number(u.searchParams.get('skip') || 0),
        limit = Number(u.searchParams.get('limit') || 30);
      data = {
        actions: u.searchParams.get('account') === 'bridge.strx' ? (options.bridgeActions ?? bridgeActions).slice(skip, skip + limit) : (options.userActions?.[u.searchParams.get('account')] ?? [])
      };
      kind = 'history';
    } else if (u.hostname === 'api-v3.raydium.io' && u.pathname === '/pools/info/ids') {
      data = options.marketPayload ?? raydium(options);
      kind = 'raydium';
    } else if (u.hostname === 'api.dexscreener.com' && u.pathname.startsWith('/latest/dex/pairs/')) {
      data = {
        pairs: [{
          priceUsd: '0.001',
          volume24h: 1000,
          txns24h: {
            buys: 10,
            sells: 10
          }
        }]
      };
      kind = 'dex';
    } else if (u.hostname === 'www.api.bloks.io' && u.pathname === '/proton/tokens/XSOL-proton-xtokens') {
      data = [{
        price: {
          quotes: {
            USD: 100
          },
          usd: 100
        }
      }];
      kind = 'xsol';
    } else {
      blocked.push(record);
      return route.abort('blockedbyclient');
    }
    record.kind = kind;
    if (kind === 'history' && u.searchParams.get('account') === 'bridge.strx' && options.bridgeResponse) {
      const override = await options.bridgeResponse(Number(u.searchParams.get('skip') || 0), record);
      if (override?.status) return route.fulfill({status: override.status, headers:{'access-control-allow-origin':'*'}, contentType:'application/json', body:JSON.stringify({error:'synthetic failure'})});
      if (override?.actions) data = {actions:override.actions};
    }
    if (kind === 'history' && options.userActionDelayMs?.[u.searchParams.get('account')]) await new Promise(resolve => setTimeout(resolve, options.userActionDelayMs[u.searchParams.get('account')]));
    if (options.stall === kind) {
      await new Promise(r => setTimeout(r, options.stallMs ?? 12000));
      return route.abort().catch(() => {});
    }
    const delay = options.delayByKind?.[kind] ?? options.delayMs;
    if (delay) await new Promise(r => setTimeout(r, delay));
    const status = options.fail === kind ? 503 : 200;
    return route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data),
      headers: {
        'access-control-allow-origin': '*',
        ...(!options.missingLastModified ? {
          'last-modified': new Date(sourceTime).toUTCString()
        } : {})
      }
    });
  });
  return {
    requests,
    blocked
  };
}
export async function seedStorage(context, {
  corruptStorage = false,
  storage = {}
} = {}) {
  await context.addInitScript(({
    corruptStorage,
    storage
  }) => {
    if (corruptStorage) localStorage.setItem('sectionVisibility', 'invalid-json');
    for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
  }, {
    corruptStorage,
    storage
  });
}

// Opt-in preservation fixtures leave every earlier phase's default payload unchanged.
export const preservationBoundaries = [
  ['atwhale', 20000000, 'Whale'], ['belowwhale', 19999999, 'Shark'],
  ['atshark', 10000000, 'Shark'], ['belowshark', 9999999, 'Dolphin'],
  ['atdolphin', 5000000, 'Dolphin'], ['belowdolphin', 4999999, 'Fish'],
  ['atfish', 1000000, 'Fish'], ['belowfish', 999999, 'Shrimp'],
  ['atshrimp', 500000, 'Shrimp'], ['belowshrimp', 499999, 'Free'],
  ['atfree', 0.000001, 'Free'], ['nostake', 0, 'No Stake'],
];
export function preservationFixtures() {
  const action = {global_sequence:'preservation-1',timestamp:sourceTime,trx_id:'preservation-stake',act:{name:'transfer',data:{from:'audituser',to:'storexstake',quantity:'25.0000 STRX',memo:'add stake'}}};
  return {
    snapshot:{...Object.fromEntries(preservationBoundaries.map(([name,staked])=>[name,{staked,unstaked:100}])),audituser:{staked:1000000,unstaked:100},nearmilestone:{staked:9500000,unstaked:0}},
    newStakers:[{username:'newarrival',total_staked:12345,date:new Date().toISOString()}],
    userActions:{storexstake:[action],audituser:[action]},
  };
}
