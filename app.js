const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const app = express()
app.use(express.json())
const path = require('path')
const dbpath = path.join(__dirname, 'twitterClone.db')

let db = null

const intiallizationOfdbAndServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Sever IS started http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error : ${e.message}`)
    process.exit(1)
  }
}
intiallizationOfdbAndServer()

const convertObjectIntoArray = e => {
  let a = []
  for (let i of e) {
    let {username} = i
    a.push(username)
  }
  return a
}

const Authentication = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.post('/register/', async (request, response) => {
  try {
    const {username, password, name, gender} = request.body

    if (password.length < 6) {
      return response.status(400).send('Password is too short')
    }
    const isUserExist = `SELECT * from user where username='${username}';
  `
    const getUser = await db.get(isUserExist)
    const hashedPassword = await bcrypt.hash(password, 10)

    if (getUser !== undefined) {
      response.status(400).send('User already exists')
    } else {
      const createUserQuery = `
    INSERT INTO user(name,username,password,gender)
    VALUES ('${name}','${username}','${hashedPassword}','${gender}')`

      await db.run(createUserQuery)
      response.send('User created successfully')
    }
  } catch (e) {
    console.log(` error : ${e.message}`)
    response.status(500).send(e.message)
    process.exit(1)
  }
})

app.post('/login/', async (request, response) => {
  try {
    const {username, password} = request.body
    const isUserExist = `SELECT * from user where username='${username}';
  `
    const getUser = await db.get(isUserExist)
    if (getUser === undefined) {
      response.status(400).send('Invalid user')
    } else {
      const camparePassword = await bcrypt.compare(password, getUser.password)
      if (!camparePassword) {
        response.status(400).send('Invalid password')
      } else {
        const payload = {
          username: username,
        }
        const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
        response.send({jwtToken})
      }
    }
  } catch (e) {
    console.log(` error : ${e.message}`)
    response.status(500).send(e.message)
    process.exit(1)
  }
})

// api 3
app.get('/user/tweets/feed/', Authentication, async (requset, response) => {
  const Query = `SELECT 
    user.username, 
    tweet.tweet, 
    tweet.date_time AS dateTime
FROM 
    tweet
JOIN 
    user ON tweet.user_id = user.user_id
WHERE 
    tweet.user_id IN (SELECT following_user_id FROM follower)
ORDER BY 
    tweet.date_time DESC
LIMIT 4;
`

  const getresult = await db.all(Query)
  response.send(getresult)
})

app.get('/user/following/', Authentication, async (request, response) => {
  const Query = `
SELECT 
  DISTINCT  user.name
FROM 
    user
JOIN 
    follower ON user.user_id = follower.following_user_id

    `
  const getresult = await db.all(Query)
  response.send(getresult)
})

app.get('/user/followers/', Authentication, async (request, response) => {
  const Query = `
SELECT 
  DISTINCT  user.name
FROM 
    user
JOIN 
    follower ON user.user_id = follower.follower_user_id
    `
  const getresult = await db.all(Query)
  response.send(getresult)
})

app.get('/tweets/:tweetId/', Authentication, async (request, response) => {
  const {tweetId} = request.params
  const getFollowingUserId = `
     SELECT user_id
FROM tweet
WHERE tweet_id = ${tweetId} AND user_id IN (SELECT following_user_id FROM follower );
)`
  const isit = await db.get(getFollowingUserId)
  if (isit === undefined) {
    response.status(401).send('Invalid Request')
  } else {
    const Query = `SELECT 
  tweet.tweet, 
  tweet.date_time AS dateTime, 
  (SELECT COUNT(*) FROM like WHERE tweet_id = ${tweetId}) AS likes, 
  (SELECT COUNT(*) FROM reply WHERE tweet_id = ${tweetId}) AS replies 
FROM tweet 
WHERE tweet.tweet_id = ${tweetId};
`
    const result = await db.get(Query)
    response.send(result)
  }
})

app.get(
  '/tweets/:tweetId/likes/',
  Authentication,
  async (request, response) => {
    const {tweetId} = request.params

    const getFollowingUserId = `
     SELECT user_id
FROM tweet
WHERE tweet_id = ${tweetId} AND user_id IN (SELECT following_user_id FROM follower );
)`
    const isit = await db.get(getFollowingUserId)
    if (isit === undefined) {
      response.status(401).send('Invalid Request')
    } else {
      const Query = `
          SELECT 
             user.username 
          FROM user join like on user.user_id=like.user_id
          Where like.tweet_id=${tweetId}`
      const result = await db.all(Query)
      response.send({likes: convertObjectIntoArray(result)})
    }
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  Authentication,
  async (request, response) => {
    const Query1 = `
  SELECT  user_id from user where username ='${request.username}'`
    const {user_id} = await db.get(Query1)
    const {tweetId} = request.params
    const getFollowingUserId = `
     SELECT user_id
FROM tweet
WHERE tweet_id = ${tweetId} AND user_id IN (SELECT following_user_id FROM follower );
)`
    const isit = await db.get(getFollowingUserId)
    if (isit === undefined) {
      response.status(401).send('Invalid Request')
    } else {
      const Query = `SELECT
         user.username,reply.reply from user join reply on user.user_id=reply.user_id
         where reply.tweet_id=${tweetId}`
      const result = await db.all(Query)
      response.send({replies: result})
    }
  },
)

app.get('/user/tweets/', Authentication, async (request, response) => {
  const Query1 = `SELECT user_id FROM user WHERE username = ?`
  const userResult = await db.get(Query1, [request.username])

  const {user_id} = userResult
  const Query = `SELECT 
  tweet.tweet,
   count(like.like_id) as likes,
   count(reply.reply_id) as replies,
   tweet.date_time as dateTime
  From (tweet join like on tweet.tweet_id=like.tweet_id) as a
  join reply on reply.tweet_id=a.tweet_id
  where tweet.user_id=${user_id}`
  const result = await db.all(Query)
  response.send(result)
})

app.post('/user/tweets/', Authentication, async (request, response) => {
  const {tweet} = request.body
  const Query1 = `
  SELECT  user_id from user where username ='${request.username}'`
  const {user_id} = await db.get(Query1)
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const second = now.getSeconds()
  const dateTime =
    year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second
  const Query = `
INSERT INTO tweet(tweet,user_id,date_time)
VALUES ('${tweet}','${user_id}','${dateTime}')`
  await db.run(Query)
  response.send('Created a Tweet')
})

app.delete('/tweets/:tweetId/', Authentication, async (request, response) => {
  const {tweetId} = request.params

  try {
    // Query to get the user ID of the authenticated user
    const Query1 = `SELECT user_id FROM user WHERE username = ?`
    const userResult = await db.get(Query1, [request.username])

    if (!userResult) {
      return response.status(404).send('User not found')
    }

    const {user_id} = userResult

    // Query to get the user ID of the tweet owner
    const Query2 = `SELECT user_id AS tweet_user_id FROM tweet WHERE tweet_id = ?`
    const tweetResult = await db.get(Query2, [tweetId])

    if (!tweetResult) {
      return response.status(404).send('Tweet not found')
    }

    const {tweet_user_id} = tweetResult

    // Check if the authenticated user is the owner of the tweet
    if (user_id !== tweet_user_id) {
      return response.status(401).send('Invalid Request')
    }

    // Delete the tweet
    const Query3 = `DELETE FROM tweet WHERE tweet_id = ?`
    await db.run(Query3, [tweetId])

    response.send('Tweet Removed')
  } catch (error) {
    console.error(error)
    response.status(500).send('Internal Server Error')
  }
})

module.exports = app
