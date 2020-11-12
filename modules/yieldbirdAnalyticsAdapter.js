import adapter from '../src/AnalyticsAdapter.js'
import adapterManager from '../src/adapterManager.js'
import { logInfo } from '../src/utils.js'

const ANALYTICS_TYPE = 'endpoint'
const ENDPOINT_URL = 'http://108.128.111.105:5000/harvest'
const GLOBAL_NAME = 'YieldbirdViewability'
const COOKIE_STORAGE_EXPIRY = 32140800000
const SESSION_COOKIE_TIMESTAMP = '_ybv_sct'

class CookieAccessor {
  read (name) {
    const parserCookies = document.cookie.split('; ').map(cookie => {
      const cookieSplit = cookie.split('=')

      return { key: cookieSplit[0], value: cookieSplit[1] }
    })

    return parserCookies.find(cookie => cookie.key === name)
  }

  write (cookieName, cookieValue) {
    const date = new Date()

    date.setTime(date.getTime() + COOKIE_STORAGE_EXPIRY)

    document.cookie = `${cookieName}=${cookieValue};expires=${date.toGMTString()};`
  }
}

class ScrollTracker {
  constructor () {
    this.latestScroll = 0
    this.totalScroll = 0
    this.scrollCounter = 0
    this.scrollDirectionChange = 0
    this.direction = null

    this._initScrollListener()
  }

  get currentScrollHeight () {
    return this.latestScroll
  }

  get siteLength () {
    return Math.max(document.documentElement.clientHeight, window.innerHeight || 0)
  }

  get maxScrollLength () {
    return Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.clientHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    )
  }

  get totalScrollLength () {
    return this.totalScroll
  }

  get totalScrollCount () {
    return this.scrollCounter
  }

  get scrollDirectionChangesCount () {
    return this.scrollDirectionChange
  }

  _initScrollListener () {
    window.addEventListener('scroll', throttle(this._writeCurrentScroll.bind(this), 300))
  }

  _writeCurrentScroll () {
    window.clearTimeout(this.scrollTimeout)
    this.scrollTimeout = window.setTimeout(() => {
      this.scrollCounter++
    }, 900)

    const currentScroll = window.scrollY || document.documentElement.scrollTop
    const direction = this.latestScroll - currentScroll > 0 ? 'up' : 'down'

    if (direction !== this.direction) {
      this.direction && this.scrollDirectionChange++
      this.direction = direction
    }

    this.totalScroll += Math.abs(this.latestScroll - currentScroll)
    this.latestScroll = currentScroll
  }
}

class YieldbirdViewability {
  constructor () {
    this.cookieAccessor = new CookieAccessor()
    this.scrollTracker = new ScrollTracker()
    this.totalHiddenTime = 0
    this.visibilityChangeTime = 0

    this.adapter = this._initialize()
  }

  call () {
    this.adapter.enableAnalytics = this._enableAnalytics

    return this.adapter
  }

  data () {
    const lastSession = this.cookieAccessor.read(SESSION_COOKIE_TIMESTAMP)
    const time = new Date().getTime()
    const pageTime = time - window.performance.timing.navigationStart

    return {
      'active_page_time': pageTime - this.totalHiddenTime,
      'browser_language': window.navigator.userLanguage || window.navigator.language,
      'url': window.location.href,
      'total_scroll_count': this.scrollTracker.totalScrollCount,
      'timestamp': time,
      'site_length': this.scrollTracker.siteLength,
      'total_scroll_length': this.scrollTracker.totalScrollLength,
      'scroll_direction_changes_count': this.scrollTracker.scrollDirectionChangesCount,
      'total_page_time': pageTime,
      'since_last_visit': lastSession ? time - Number(lastSession.value) : 0
    }
  }

  _initialize () {
    const analytics = adapter({
      global: GLOBAL_NAME,
      analyticsType: ANALYTICS_TYPE
    })

    this._startVisibilityListener()
    analytics.originEnableAnalytics = analytics.enableAnalytics

    window.addEventListener('beforeunload', this._beforeUnloadEvent.bind(this))

    return analytics
  }

  _enableAnalytics () {
    logInfo('Yieldbird Analytics is ready')
  }

  _startVisibilityListener () {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.visibilityChangeTime = new Date().getTime()
      } else {
        if (this.visibilityChangeTime > 0) {
          this.totalHiddenTime += new Date().getTime() - this.visibilityChangeTime
        }
      }
    })
  }

  _beforeUnloadEvent () {
    this._manageSession()
    this._send()
  }

  _manageSession () {
    this.cookieAccessor.write(SESSION_COOKIE_TIMESTAMP, new Date().getTime())
  }

  _send () {
    const data = this.data()
    const form = new FormData()

    Object.keys(data).forEach(key => { form.append(key, data[key]) })

    window.navigator.sendBeacon(ENDPOINT_URL, form)
  }
}

function throttle (callback, limit) {
  let tick = false

  return function () {
    if (!tick) {
      tick = true

      callback()
      setTimeout(() => { tick = false }, limit)
    }
  }
}

const yieldbirdViewability = new YieldbirdViewability()
let yieldbirdViewabilityAnalytics = yieldbirdViewability.call()

if (window.location.href.includes('viewability_debug=true')) {
  window.yieldbirdViewability = yieldbirdViewability
}

adapterManager.registerAnalyticsAdapter({
  adapter: yieldbirdViewabilityAnalytics,
  code: 'yieldbirdViewability'
})

export default yieldbirdViewabilityAnalytics
