export default async function handler(req, res) {
  const { id, type, season, episode } = req.query;

  if (!id || !type) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  let urls = [];
  let labels = [];

  if (type === 'tv') {
    const s = season || 1;
    const e = episode || 1;
    
    urls = [
      `https://vidlove.cc/embed/tv/${id}/${s}/${e}?autoplay=false&showNextEpisode=1`,
      `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=false&nextEpisode=true&episodeSelector=true`,
      `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`,
      `https://vidnest.fun/tv/${id}/${s}/${e}?autoplay=1`,
      `https://vixsrc.to/tv/${id}/${s}/${e}?autoplay=1`
    ];
    labels = ['HackyMax', 'Infinity', 'Nebula', 'Zenith', 'Hyperion'];

  } else {
    // Movie
    urls = [
      `https://vidlove.cc/embed/movie/${id}?autoplay=false`,
      `https://vidlink.pro/movie/${id}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=false`,
      `https://embed.smashystream.com/playere.php?tmdb=${id}`,
      `https://vidnest.fun/movie/${id}?autoplay=1`,
      `https://vixsrc.to/movie/${id}?autoplay=1`
    ];
    labels = ['HackyMax', 'Infinity', 'Nebula', 'Zenith', 'Hyperion'];
  }

  // Prevent caching so new server labels appear instantly
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).json({ urls, labels });
}
