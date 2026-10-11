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
      `hackymax://tv/${id}/${s}/${e}`,
      `sinmax://tv/${id}/${s}/${e}`,
      `zeemax://tv/${id}/${s}/${e}`,
      `https://vidlove.cc/embed/tv/${id}/${s}/${e}?autoplay=1&mute=0&showNextEpisode=1`,
      `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=true&muted=false&nextEpisode=true&episodeSelector=true`,
      `https://vidnest.fun/tv/${id}/${s}/${e}?autoplay=1`,
      `https://vixsrc.to/tv/${id}/${s}/${e}?autoplay=1`,
      `https://vidup.to/tv/${id}/${s}/${e}?autoplay=1`,
      `https://vidfast.pro/tv/${id}/${s}/${e}?autoplay=1&mute=0`,
      `https://vidcore.net/tv/${id}/${s}/${e}?autoplay=1&server=orbit`,
      `https://anyembed.xyz/embed/tmdb-tv-${id}-${s}-${e}?logo=false&autoplay=1`
    ];
    labels = ['HackyMax ✦', 'SinMax ✦', 'ZeeMax ✦', 'Infinity', 'Nova', 'Zenith', 'Hyperion', 'Vortex', 'OmniPlay', 'Orbit', 'Stellar'];

  } else {
    // Movie
    urls = [
      `hackymax://movie/${id}`,
      `sinmax://movie/${id}`,
      `zeemax://movie/${id}`,
      `https://vidlove.cc/embed/movie/${id}?autoplay=1&mute=0`,
      `https://vidlink.pro/movie/${id}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=true&muted=false`,
      `https://vidnest.fun/movie/${id}?autoplay=1`,
      `https://vixsrc.to/movie/${id}?autoplay=1`,
      `https://vidup.to/movie/${id}?autoplay=1`,
      `https://vidfast.pro/movie/${id}?autoplay=1&mute=0`,
      `https://vidcore.net/movie/${id}?autoplay=1&server=orbit`,
      `https://anyembed.xyz/embed/tmdb-movie-${id}?logo=false&autoplay=1`
    ];
    labels = ['HackyMax ✦', 'SinMax ✦', 'ZeeMax ✦', 'Infinity', 'Nova', 'Zenith', 'Hyperion', 'Vortex', 'OmniPlay', 'Orbit', 'Stellar'];
  }

  // Short cache so new servers appear quickly
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300');
  res.status(200).json({ urls, labels });
}
