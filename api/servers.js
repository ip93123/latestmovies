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
      `https://vidlove.cc/embed/tv/${id}/${s}/${e}?autoplay=true&showNextEpisode=1`,
      `https://player.videasy.ws/embed/tv/${id}/${s}/${e}?autoplay=1&autonext=1&ds_lang=sin`,
      `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=true&nextEpisode=true&episodeSelector=true`,
      `https://cdn.vidspark.to/tv/${id}/${s}/${e}?autoplay=true`,
      `https://vidy.st/tv/${id}/${s}/${e}?color=E8C97A&autoplay=true&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true`,
      `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}&autoplay=1`,
      `https://vidnest.fun/tv/${id}/${s}/${e}?autoplay=1`,
      `https://vixsrc.to/tv/${id}/${s}/${e}?autoplay=1`
    ];
    labels = ['HackyMax', 'Vortex', 'Infinity', 'Spark', 'Nova', 'Nebula', 'Zenith', 'Hyperion'];

  } else {
    // Movie
    urls = [
      `https://vidlove.cc/embed/movie/${id}?autoplay=true`,
      `https://player.videasy.ws/embed/movie/${id}?autoplay=1&ds_lang=sin`,
      `https://vidlink.pro/movie/${id}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=true`,
      `https://cdn.vidspark.to/movie/${id}?autoplay=true`,
      `https://vidy.st/movie/${id}?color=E8C97A&autoplay=true`,
      `https://embed.smashystream.com/playere.php?tmdb=${id}&autoplay=1`,
      `https://vidnest.fun/movie/${id}?autoplay=1`,
      `https://vixsrc.to/movie/${id}?autoplay=1`
    ];
    labels = ['HackyMax', 'Vortex', 'Infinity', 'Spark', 'Nova', 'Nebula', 'Zenith', 'Hyperion'];
  }

  // Prevent caching so new server labels appear instantly
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).json({ urls, labels });
}
