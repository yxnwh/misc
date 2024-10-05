const axios = require('axios')
const config = require('./config')
const nodemailer = require('nodemailer')
const ejs = require('ejs')
const fs = require('fs')
const path = require('path')
const logs = []

// 请求配置
axios.defaults.baseURL = config.baseUrl
axios.defaults.headers['cookie'] = process.env.COOKIE

// 相应拦截处理
axios.interceptors.response.use((response) => {
  const { data } = response
  if (data.err_msg === 'success' && data.err_no === 0) {
    return data
  } else {
    return Promise.reject(data.err_msg)
  }
}, (error) => {
  return Promise.reject(error)
})

/**
 * 查看今天是否已经签到
 *
 * @return {Boolean} 是否签到过 
 */
const getCheckStatus = async () => {
  try {
    const getCheckStatusRes = await axios({
      url: config.api.getCheckStatus,
      method: 'get'
    })
    return getCheckStatusRes.data
  } catch (error) {
    throw `查询签到失败!【${error}】`
  }
}

/**
 * 查询当前矿石
 *
 */
const getCurrentPoint = async () => {
  try {
    const getCurrentPointRes = await axios({ url: config.api.getCurrentPoint, method: 'get' })
    console.log(`当前总矿石数: ${getCurrentPointRes.data}`)
  } catch (error) {
    throw `查询矿石失败!${error.err_msg}`
  }

}
/**
 * 查询免费抽奖次数
 *
 * @return {Boolean} 是否有免费抽奖次数
 */
const getlotteryStatus = async () => {
  try {
    const getlotteryStatusRes = await axios({ url: config.api.getlotteryStatus, method: 'get' })
    return getlotteryStatusRes.data.free_count === 0
  } catch (error) {
    throw `查询免费抽奖失败！【${error}】`
  }
}

/**
 * 获取沾喜气列表用户historyId
 *
 * @return {string} 被沾的幸运儿的history_id
 */
const getLuckyUserHistoryId = async () => {
  try {
    // 接口为分页查询  默认查询条10条数据 {page_no: 0, page_size: 5}
    const luckyList = await axios({ url: config.api.getLuckyUserList, method: 'post' })
    // 随机抽取一位幸运儿  沾他
    return luckyList.data.lotteries[Math.floor(Math.random() * luckyList.data.lotteries.length)]?.history_id
  } catch (error) {
    throw `获取沾喜气列表用户historyId失败`
  }
}

/**
 * 占喜气
 *
 */
const dipLucky = async () => {
  try {
    // 获取historyId
    const historyId = await getLuckyUserHistoryId()
    // 沾喜气接口   传递lottery_history_id
    const dipLuckyRes = await axios({ url: config.api.dipLucky, method: 'post', data: { lottery_history_id: historyId } })
    console.log(`占喜气成功! 🎉 【当前幸运值：${dipLuckyRes.data.total_value}/6000】`)
  } catch (error) {
    throw `占喜气失败！ ${error}`
  }
}

/**
 * 抽奖
 *
 */
const draw = async () => {
  try {
    const freeCount = await getlotteryStatus()
    if (freeCount) {
      // 没有免费抽奖次数
      throw '今日免费抽奖已用完'
    }

    // 开始抽奖
    const drawRes = await axios({ url: config.api.draw, method: 'post' })
    console.log(`恭喜你抽到【${drawRes.data.lottery_name}】🎉`)

    // 沾喜气
    await dipLucky()
    if (drawRes.data.lottery_type === 1) {
      // 抽到矿石 查询总矿石
      await getCurrentPoint()
    }
  } catch (error) {
    console.error(`抽奖失败!=======> 【${error}】`)
  }
}

/**
 *查询签到天数
 *
 * @return {Object} continuousDay 连续签到天数 sumCount 总签到天数
 */
const getCheckInDays = async () => {
  try {
    const getCheckInDays = await axios({ url: config.api.getCheckInDays, method: 'get' })
    return { continuousDay: getCheckInDays.data.cont_count, sumCount: getCheckInDays.data.sum_count }
  } catch (error) {
    throw `查询签到天数失败!🙁【${getCheckInDays.err_msg}】`
  }
}


/**
 * 签到
 * 
 */
const checkIn = async () => {
  try {
    // 查询今天是否签到没
    const checkStatusRes = await getCheckStatus()

    if (!checkStatusRes) {
      // 签到
      const checkInRes = await axios({ url: config.api.checkIn, method: 'post' })
      console.log(`签到成功+${checkInRes.data.incr_point}矿石，总矿石${checkInRes.data.sum_point}`)

      // 查询签到天数
      const getCheckInDaysRes = await getCheckInDays()
      console.log(`连续签到【${getCheckInDaysRes.continuousDay}】天  总签到天数【${getCheckInDaysRes.sumCount}】  掘金不停 签到不断💪`)

      // 签到成功 去抽奖
      await draw()
    } else {
      console.log('今日已经签到 ✅')
    }

  } catch (error) {
    console.error(`签到失败!=======> ${error}`)
  }
}

/**
 * 发送邮件
 *
 */
const sendEmail = async () => {
  try {
    const template = ejs.compile(fs.readFileSync(path.resolve(__dirname, 'email.ejs'), 'utf8'));
    const transporter = nodemailer.createTransport({
      service: process.env.SERVICE, // 邮箱服务
      port: 465,
      secure: true,
      secureConnection: true,
      auth: {
        user: process.env.EMAIL, // 发送者邮箱
        pass: process.env.PASS, // 邮箱授权码
      }
    })

    // 发送邮件
    await transporter.sendMail({
      from: process.env.EMAIL,
      to: process.env.EMAIL,
      subject: '掘金签到通知🔔',
      html: template({
        logs: logs
      })
    })

  } catch (error) {
    console.error(`邮件发送失败！${error}`)
  }


}


/**
 * 启动程序  处理日志输出 开始签到流程 将结果通过邮件形式发送
 *
 */
const start = async () => {
  // 日志处理  将脚本日志通过ejs渲染成html
  console.oldLog = console.log
  console.oldErr = console.error

  console.log = (str) => {
    logs.push({
      type: 'success',
      text: str
    })
    console.oldLog(str)
  }

  console.error = (str) => {
    logs.push({
      type: 'error',
      text: str
    })
    console.oldErr(str)
  }

  await checkIn()

  await sendEmail()
}

start()

async function start() {
  const puppeteer = require('puppeteer');
  
  const browser = await puppeteer.launch({
    headless: false,
    timeout: 3000,
  });
  
  const page = await browser.newPage();
  
  await page.goto('https://juejin.cn/')
  console.log(page, '---page')

}

start()
