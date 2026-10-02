const https = require('node:https')
const agent = new https.Agent({ keepAlive: true, maxSockets: 1 })

function fetchGame() {
  return new Promise((resolve, reject) => {
    // Certificate exception applies only to this fixed loopback request.
    const req = https.get({ agent, hostname: '127.0.0.1', port: 2999, path: '/liveclientdata/allgamedata', rejectUnauthorized: false, timeout: 2500 }, res => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return }
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk; if (body.length > 5_000_000) req.destroy(new Error('响应过大')) })
      res.on('error', reject)
      res.on('end', () => { try { const data = JSON.parse(body); if (!Array.isArray(data.allPlayers) || !data.gameData) throw new Error('接口数据格式不正确'); resolve(data) } catch (e) { reject(e) } })
    })
    req.on('timeout', () => req.destroy(new Error('请求超时')))
    req.on('error', reject)
  })
}

function createTracker() {
  let lastTime = -1
  let seen = new Set()
  return {
    reset() { lastTime = -1; seen.clear() },
    update(data) {
      const time = data.gameData.gameTime
      if (time < lastTime) seen.clear()
      lastTime = time
      const events = (data.events?.Events ?? []).filter(event => {
        if (seen.has(event.EventID)) return false
        seen.add(event.EventID)
        return event.EventName === 'ChampionKill'
      })
      return events
    }
  }
}

function mockGame(tick) {
  const names = ['测试玩家', '队友一', '队友二', '队友三', '队友四', '对手一', '对手二', '对手三', '对手四', '对手五']
  const kills = Math.floor(tick / 4)
  return {
    activePlayer: { summonerName: names[0] },
    gameData: { gameTime: 300 + tick, gameMode: 'CLASSIC', mapName: 'Map11' },
    allPlayers: names.map((name, i) => ({ summonerName: name, championName: ['Ahri','Lee Sin','Jinx','Leona','Garen','Lux','Vi','Ashe','Thresh','Darius'][i], team: i < 5 ? 'ORDER' : 'CHAOS', scores: { kills: i === 0 ? kills : 0, deaths: i === 5 ? kills : 0, assists: 0, creepScore: 30 + tick } })),
    events: { Events: Array.from({ length: kills }, (_, i) => ({ EventID: i, EventName: 'ChampionKill', EventTime: 304 + i * 4, KillerName: names[0], VictimName: names[5], Assisters: [names[1]] })) }
  }
}
module.exports = { fetchGame, createTracker, mockGame }
