const express = require('express')
const app = express()
app.use(express.json())
const path = require('path')
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => console.log('Server is running at port 3000'))
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDbAndServer()

//Register User API
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = '${username}';
    `
  const userResponse = await db.get(selectUserQuery)
  if (userResponse === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createUserQuery = `
                INSERT INTO 
                    user(username, password, name, gender)
                VALUES
                    (
                        '${username}',
                        '${hashedPassword}',
                        '${name}',
                        '${gender}'
                    );
            `
      await db.run(createUserQuery)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//Login User API
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = '${username}';
    `
  const userResponse = await db.get(selectUserQuery)
  if (userResponse === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      userResponse.password,
    )
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//Middleware Authentication Function
const authenticateToken = (request, response, next) => {
  const authHeader = request.headers['authorization']
  let jwtToken
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

//Tweets API
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';
  `
  const dbUser = await db.get(selectUserQuery)
  const userId = dbUser.user_id
  const tweetQuery = `
    SELECT user.username AS username, tweet.tweet AS tweet, tweet.date_time AS date_time
    FROM (follower
      JOIN tweet ON tweet.user_id = follower.following_user_id) AS T
      JOIN user ON user.user_id = T.user_id
    WHERE follower.follower_user_id = ${userId}
    ORDER BY date_time DESC
    LIMIT 4;
  `
  const tweetsResponse = await db.all(tweetQuery)
  response.send(
    tweetsResponse.map(eachObj => ({
      username: eachObj.username,
      tweet: eachObj.tweet,
      dateTime: eachObj.date_time,
    })),
  )
})

//API4
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';
  `
  const dbUser = await db.get(selectUserQuery)
  const userId = dbUser.user_id
  const followingQuery = `
    SELECT name
    FROM follower
      JOIN user 
      ON follower.following_user_id = user.user_id
    WHERE follower.follower_user_id = ${userId}
  `
  const followingResponse = await db.all(followingQuery)
  response.send(followingResponse)
})

//API5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';
  `
  const dbUser = await db.get(selectUserQuery)
  const userId = dbUser.user_id

  const followingQuery = `
    SELECT name
    FROM follower
      JOIN user ON follower_user_id = user_id
    WHERE following_user_id = ${userId}
  `
  const followingResponse = await db.all(followingQuery)
  response.send(followingResponse)
})

//API6
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweetId} = request.params
  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}'
  `
  const dbUser = await db.get(selectUserQuery)
  const userId = dbUser.user_id
  const selectFollowerQuery = `
    SELECT tweet, COUNT(reply_id) AS replies, COUNT(like_id) AS likes, tweet.date_time AS dateTime
    FROM (tweet
      JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T
      JOIN like ON like.tweet_id = T.tweet_id 
      JOIN follower ON tweet.user_id = follower.following_user_id
    WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${userId};
  `
  const followerResponse = await db.get(selectFollowerQuery)
  if (followerResponse.tweet === null) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    response.send(followerResponse)
  }
})

//API7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}'
  `
    const dbUser = await db.get(selectUserQuery)
    const userId = dbUser.user_id
    const tweetLikesQuery = `
      SELECT user.username
      FROM follower
        JOIN tweet ON follower.following_user_id = tweet.user_id
        JOIN like ON like.tweet_id = tweet.tweet_id
        JOIN user ON like.user_id = user.user_id
      WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${userId};
    `
    const tweetLikesResponse = await db.all(tweetLikesQuery)
    if (tweetLikesResponse.length == 0) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const userArr = []
      tweetLikesResponse.map(eachObj => userArr.push(eachObj.username))
      response.send({likes: userArr})
    }
  },
)

//API8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}'
  `
    const dbUser = await db.get(selectUserQuery)
    const userId = dbUser.user_id
    const tweetReplyQuery = `
    SELECT user.name, reply.reply
    FROM tweet
      JOIN follower ON follower.following_user_id = tweet.user_id
      JOIN reply ON reply.tweet_id = tweet.tweet_id
      JOIN user ON reply.user_id = user.user_id
    WHERE follower.follower_user_id = ${userId} AND tweet.tweet_id = ${tweetId};
  `
    const replyResponse = await db.all(tweetReplyQuery)
    if (replyResponse.length === 0) {
      response.send(401)
      response.send('Invalid Request')
    } else {
      response.send({replies: replyResponse})
    }
  },
)

//API9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}'
  `
  const dbUser = await db.get(selectUserQuery)
  const userId = dbUser.user_id
  const userTweetsQuery = `
    SELECT tweet.tweet, COUNT(like.like_id) AS likes, COUNT(reply.reply) AS replies, tweet.date_time AS dateTime
    FROM (tweet
      LEFT JOIN like ON tweet.tweet_id = like.tweet_id) AS T
      LEFT JOIN reply ON reply.tweet_id = T.tweet_id
    WHERE tweet.user_id = ${userId}
    GROUP BY tweet.tweet_id
  `
  const userTweetsResponse = await db.all(userTweetsQuery)
  response.send(userTweetsResponse)
})

app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const {username} = request
  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}'
  `
  const dbUser = await db.get(selectUserQuery)
  const userId = dbUser.user_id
  const date = new Date()
  const createTweetQuery = `
    INSERT INTO 
      tweet(tweet, user_id, date_time)
    VALUES
      (
        '${tweet}', ${userId}, '${date}'
      );
  `
  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})

app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}'
  `
    const dbUser = await db.get(selectUserQuery)
    const userId = dbUser.user_id
    const checkQuery = `
    SELECT tweet
    FROM tweet
    WHERE tweet_id = ${tweetId} AND user_id = ${userId};
  `
    const checkUser = await db.get(checkQuery)
    if (checkUser === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deleteQuery = `
      DELETE FROM
        tweet
      WHERE tweet_id = ${tweetId}
    `
      await db.run(deleteQuery)
      response.send('Tweet Removed')
    }
  },
)

module.exports = app
