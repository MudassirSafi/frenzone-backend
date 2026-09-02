const nodemailer = require("nodemailer")

require("dotenv").config()

const godaddyEmail = process.env.EMAIL
const godaddyPassword = process.env.PASSWORD


const mailTransport = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    auth: { 
        user: godaddyEmail,
        pass: godaddyPassword
    },
    secureConnection: true,
    tls: { ciphers: 'SSLv3' }
});

const contactUs = async(req,res)=>{
    try{
        const {username,email,phonenumber} = req.body

        const mailOptions = {
            from: godaddyEmail,
            to: godaddyEmail,
            subject: 'Contact Us Form Submission',
            text: `Contact Details:

Username: ${username}
Email: ${email}
Phone Number:${phonenumber}      

`
          };
    
        await mailTransport.sendMail(mailOptions)

        res.status(200).json({
            message:"Form Submitted"
        })

    }catch(error){
        res.status(400).json({
            error:error.message
        })

    }
}

const agencyForm = async(req,res)=>{
    try{
        const {agencyName, email,contactPerson,phoneNumber,position,agencyWebsite, describeAgency,contentCreators,creatorsInterested,prefferedCollaboration,reasons,previous} = req.body

        const mailOptions = {
            from: godaddyEmail,
            to: godaddyEmail,
            subject: 'Agency Form Submission',
            text: `Agency Information:

    Agency Name: ${agencyName}
    Email Address: ${email}
    Contact Person: ${contactPerson}
    Phone Number: ${phoneNumber}
    Posititon: ${position}
    Agency Website: ${agencyWebsite}
    
Agency Overview:

    Agency Description: ${describeAgency}
    Content Creator Represent: ${contentCreators}

Collaboration Preferences:

    Creators Interested: ${creatorsInterested}
    Preffered Collaboration Models: ${prefferedCollaboration}
    
Why Partner with Frenzone.live

    Reasons: ${reasons}
    Previous Collaborations: ${previous}

`
          };
    
        await mailTransport.sendMail(mailOptions)
        res.status(200).json({
            message:"Agency Form Submitted"
        })

    }catch(error){
        res.status(400).json({
            error:error.message
        })

    }
}




module.exports = {contactUs,agencyForm}