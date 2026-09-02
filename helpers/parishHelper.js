function checkParish(latitude, longitude){

    var parishesList = [
      'Kingston and St. Andrew',
      'Portland',
      'St. Thomas',
      'St. Mary',
      'St. Ann',
      'Trelawny',
      'St. James',
      'Hanover',
      'Westmoreland',
      'St. Elizabeth',
      'Manchester',
      'Clarendon',
      'St. Catherine',
      'St. Thomas'
    ]
    
    const parishBounds = {
      'Kingston and St. Andrew': {
        minLat: 17.9,
        maxLat: 18.1,
        minLong: -76.9,
        maxLong: -76.7
      },
      'Portland': {
        minLat: 17.9,
        maxLat: 18.2,
        minLong: -76.65,
        maxLong: -76.35
      },
      'St. Thomas': {
        minLat: 17.85,
        maxLat: 18.2,
        minLong: -76.6,
        maxLong: -76.15
      },
      'St. Mary': {
        minLat: 18.2,
        maxLat: 18.55,
        minLong: -76.8,
        maxLong: -76.45
      },
      'St. Ann': {
        minLat: 18.15,
        maxLat: 18.6,
        minLong: -77.3,
        maxLong: -76.9
      },
      'Trelawny': {
        minLat: 18.2,
        maxLat: 18.6,
        minLong: -77.7,
        maxLong: -77.35
      },
      'St. James': {
        minLat: 18.3,
        maxLat: 18.7,
        minLong: -77.35,
        maxLong: -76.95
      },
      'Hanover': {
        minLat: 18.3,
        maxLat: 18.6,
        minLong: -78.25,
        maxLong: -77.95
      },
      'Westmoreland': {
        minLat: 18.05,
        maxLat: 18.5,
        minLong: -78.35,
        maxLong: -77.9
      },
      'St. Elizabeth': {
        minLat: 17.7,
        maxLat: 18.2,
        minLong: -78.15,
        maxLong: -77.65
      },
      'Manchester': {
        minLat: 17.85,
        maxLat: 18.3,
        minLong: -77.75,
        maxLong: -77.3
      },
      'Clarendon': {
        minLat: 17.85,
        maxLat: 18.3,
        minLong: -77.3,
        maxLong: -76.85
      },
      'St. Catherine': {
        minLat: 17.9,
        maxLat: 18.15,
        minLong: -77.1,
        maxLong: -76.75
      },
      'St. Thomas': {
        minLat: 17.85,
        maxLat: 18.2,
        minLong: -76.6,
        maxLong: -76.15
      }
    };
  
    function isWithinBounds(lat, long, bounds) {
      return lat >= bounds.minLat && lat <= bounds.maxLat && long >= bounds.minLong && long <= bounds.maxLong;
    }
    
    var randomIndex = Math.floor(Math.random() * parishesList.length);
    if (isNaN(latitude) || isNaN(longitude)) {
      return parishesList[randomIndex];
    }
  
    const userLat = parseFloat(latitude);
    const userLong = parseFloat(longitude);
  
    let foundParish = null;
  
  
    for (const [parish, bounds] of Object.entries(parishBounds)) {
      if (isWithinBounds(userLat, userLong, bounds)) {
        foundParish = parish;
        break;
      }
    }
  
    if (foundParish) {
      return foundParish
    } else {
        return (parishesList[randomIndex]).toLowerCase();
    }
  }

  module.exports = { checkParish };