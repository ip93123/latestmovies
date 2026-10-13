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
      `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=true&nextEpisode=true&episodeSelector=true`,
      `https://moviesapi.to/tv/${id}/${s}/${e}`,
      `https://autoembed.co/tv/tmdb/${id}-${s}-${e}`,
      `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`,
      `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
      `https://vidlove.cc/embed/tv/${id}/${s}/${e}?autoplay=1&mute=0&showNextEpisode=1`,
      `https://vidnest.fun/tv/${id}/${s}/${e}?autoplay=1`,
      `https://vixsrc.to/tv/${id}/${s}/${e}?autoplay=1`,
      `https://vidup.to/tv/${id}/${s}/${e}?autoplay=1`,
      `https://vidfast.pro/tv/${id}/${s}/${e}?autoplay=1&mute=0`,
      `https://vidcore.net/tv/${id}/${s}/${e}?autoplay=1&server=orbit`,
      `https://anyembed.xyz/embed/tmdb-tv-${id}-${s}-${e}?logo=false&autoplay=1`,
    ];
    labels = ['HackyMax ✦', 'MoviesAPI', 'AutoEmbed', 'SmashyStream', '2Embed', 'Infinity', 'Zenith', 'Hyperion', 'Vortex', 'OmniPlay', 'Orbit', 'Stellar'];

  } else {
    // Movie
    urls = [
      `https://vidlink.pro/movie/${id}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=true`,
      `https://moviesapi.to/movie/${id}`,
      `https://autoembed.co/movie/tmdb/${id}`,
      `https://embed.smashystream.com/playere.php?tmdb=${id}`,
      `https://www.2embed.cc/embed/${id}`,
      `https://vidlove.cc/embed/movie/${id}?autoplay=1&mute=0`,
      `https://vidnest.fun/movie/${id}?autoplay=1`,
      `https://vixsrc.to/movie/${id}?autoplay=1`,
      `https://vidup.to/movie/${id}?autoplay=1`,
      `https://vidfast.pro/movie/${id}?autoplay=1&mute=0`,
      `https://vidcore.net/movie/${id}?autoplay=1&server=orbit`,
      `https://anyembed.xyz/embed/tmdb-movie-${id}?logo=false&autoplay=1`,
    ];
    labels = ['HackyMax ✦', 'MoviesAPI', 'AutoEmbed', 'SmashyStream', '2Embed', 'Infinity', 'Zenith', 'Hyperion', 'Vortex', 'OmniPlay', 'Orbit', 'Stellar'];
  }

  // Short cache so new servers appear quickly
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300');
  res.status(200).json({ urls, labels });
}
