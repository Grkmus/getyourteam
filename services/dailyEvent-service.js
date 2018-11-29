const DailyEventModel = require('../models/dailyEvent')
const PlayerModel = require('../models/player')
const TeamService = require('./team-service')
const Faker = require('faker')

async function findAll() {
    return DailyEventModel.find({})
}

async function add(event) {
    return DailyEventModel.create(event)
}

async function del(eventId) {
    return DailyEventModel.deleteOne({ _id: eventId })
}

async function update(eventId, data) {
    return DailyEventModel.findOneAndUpdate({ _id: eventId }, data, { new: true })
}

async function find(eventId) {
    return DailyEventModel.findOne({ _id: eventId }).populate(['attendees', {
        path: 'teams',
        populate: { path: 'players' }
    }, 'attendeesToBeSelected'])
}

async function addAttendee(eventId, attendeeId) {
    let event =  await DailyEventModel.findOne({ _id: eventId }).populate(['attendees'])
    const attendee = await PlayerModel.findOne({ _id: attendeeId })

    event.attendees.push(attendee)
    event.attendeesToBeSelected.push(attendee)
    event = await event.save()

    return event
}



async function phase1(eventId, date) {
    const duration = date - Date.now()
    //Wait attendees to join for one week
    // console.log('phase1')
    return new Promise(async (resolve, reject) => {
        setTimeout(async () => {
            const event = await find(eventId)
            console.log(event.attendees.length)
            if (event.attendees < 12) {
                await del(event._id)
                reject(new Error('not enough participant'))
            } else {
                event.phase = 'phase1'
                await event.save()
                phase2(event)
                resolve('ok')
            }
        }, duration);
    })
}


async function phase2(event) {
    //Generate the teams and select the captains
    // console.log('phase2')
    event.attendees.sort((a,b) =>  //c/o Marco Demaio https://goo.gl/APQFAS
        (a.ratingEvaluation > b.ratingEvaluation) ? -1 : ((b.ratingEvaluation > a.ratingEvaluation) ? 1 : 0)); 
    
    const numberOfTeams = Math.round(event.attendees.length / 3)
    
    for (let i = 0; i < numberOfTeams; i++) {
       
        const team = await TeamService.add({ name: Faker.random.word() })
        team.players.push(event.attendees[i])
        event.teams.push(team)
        event.attendeesToBeSelected.splice(event.attendeesToBeSelected.indexOf(event.attendees[i]))
        await team.save()
    }
    
    calculateCaptainCredits(event)
}

async function calculateCaptainCredits(event) {
    //Calculation of credit that each captain get
    // let totalPoint = 0 
    // event.attendees.forEach(attendee => {
    //     totalPoint = totalPoint + +attendee.ratingEvaluation
    // })
    const totalPoint = (event.attendees.reduce(( a, b ) => {
        return {ratingEvaluation: a.ratingEvaluation + b.ratingEvaluation}
    })).ratingEvaluation
    
    const pointForEachCaptain = totalPoint / event.teams.length
    
    event.teams.forEach(async (team) => {
        let captain = team.players[0]
        captain.credit = (pointForEachCaptain - captain.ratingEvaluation).toFixed(2)
        await captain.save()
    })
    event.phase = 'phase2'
    event = await event.save()
    return event
}

async function captainPicksPlayer(eventId, teamId, playerId) {
    await TeamService.addPlayerToTeam(teamId, playerId)
    const event = await find(eventId)
    const player = await PlayerModel.findOne({ _id: playerId })
    event.attendeesToBeSelected.splice(event.attendeesToBeSelected.indexOf(player))
    await event.save()
}


module.exports = {
    findAll,
    find,
    add,
    addAttendee,
    captainPicksPlayer,
    del,
    update,
    phase1,
    phase2
}


