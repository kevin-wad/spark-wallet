import LightningClient from 'lightning-client'
import EventEmitter from 'events'
import request from 'superagent'

const rateUrl = 'https://apiv2.bitcoinaverage.com/indices/local/ticker/short?crypto=BTC&fiat=USD'
    , rateInterval = 120000

module.exports = lnPath => {
  const ln = LightningClient(lnPath)
      , em = new EventEmitter

  async function waitany(last_index) {
    const inv = await ln.waitanyinvoice(last_index)
    em.emit('waitany', inv)
    waitany(inv.pay_index)
  }

  ln.listinvoices()
    .then(r => Math.max(...r.invoices.map(inv => inv.pay_index || 0)))
    .then(waitany)

  let lastRate
  ;(async function getrate() {
    // @XXX check if anybody is listening?
    em.emit('rate', lastRate = await request(rateUrl).then(r => r.body.BTCUSD.last))
    setTimeout(getrate, rateInterval)
  })()

  return (req, res) => {
    res.set({
      'Content-Type':  'text/event-stream'
    , 'Cache-Control': 'no-cache'
    , 'Connection':    'keep-alive'
    }).flushHeaders()

    const keepAlive = setInterval(_ => res.write(': keepalive\n\n'), 25000)

    const onPay = inv => res.write(`event:waitany\ndata:${ JSON.stringify(inv) }\n\n`)
    em.on('waitany', onPay)

    const onRate = rate => res.write(`event:btcusd\ndata:${ JSON.stringify(rate) }\n\n`)
    em.on('rate', onRate)
    lastRate && onRate(lastRate)

    req.on('close', _ => (em.removeListener('waitany', onPay)
                        , em.removeListener('rate', onRate)
                        , clearInterval(keepAlive)))
  }
}