export default async function handler(req, res) {
  const { id, type, season, episode, hasSub } = req.query;

  if (!id || !type) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const s = season || 1;
  const e = episode || 1;
  const subKey = (type === 'tv') ? `${id}_S${s}_E${e}` : String(id);

  // Predefined Sinhala Subtitle IDs
  const SINHALA_SUB_KEYS = new Set([
    '1235877', '869227', '1506736', '646097', '1542187', '1419406', '1071215', '1213243',
    '1479832', '1321108', '1433117', '1408162', '1508564', '1069945', '1149791', '1508168',
    '1314279', '1544847', '1473354', '155518', '154983', '341895', '337375', '859987',
    '863675', '854291', '360648', '349479', '618435', '609503', '372297', '371900',
    '117751', '109012', '268660', '274092', '575351', '574465', '41727'
  ]);

  const hasSinhalaSub = hasSub === '1' || SINHALA_SUB_KEYS.has(String(id)) || SINHALA_SUB_KEYS.has(subKey);

  let urls = [];
  const labels = ['HackyMax', 'Nebula', 'Stellar', 'Nova', 'Vortex', 'Infinity', 'Spark', 'Sonic', 'Bolt'];

  if (type === 'tv') {
    if (hasSinhalaSub) {
      urls = [
        `https://vidy.st/tv/${id}/${s}/${e}?color=E8C97A&autoplay=true&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true&sub=false&subtitles=false&cc=false&subLang=none`,
        `https://vidstuck.cc/embed/tv/${id}/${s}/${e}?branding=HackyMax&color=E8C97A&autoplay=true&nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&subtitle=off&sub=false&subtitles=false&cc=false`,
        `https://player.cinezo.live/embed/tv/${id}/${s}/${e}?autoplay=true&opacity=0&fontsize=0&fontcolor=transparent&sub=false&subtitles=false&primarycolor=e8b86d&secondarycolor=0a0a12`,
        `https://vidlove.cc/embed/tv/${id}/${s}/${e}?autoplay=true&showNextEpisode=1&sub=false&subtitles=false&cc=false`,
        `https://player.videasy.ws/embed/tv/${id}/${s}/${e}?autoplay=1&autonext=1&ds_lang=bre&sub=0&subtitles=false`,
        `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=true&nextEpisode=true&episodeSelector=true&sub.mode=off`,
        `https://cdn.vidspark.to/tv/${id}/${s}/${e}?autoplay=true&sub=false&subtitles=false&cc=false`,
        `https://player.vidzee.wtf/embed/tv/${id}/${s}/${e}?sub=false&subtitles=false`,
        `https://vidbolt.xyz/tv/${id}/${s}/${e}?theme=E8C97A&autoPlay=true&sub=false&subtitles=false`
      ];
    } else {
      urls = [
        `https://vidy.st/tv/${id}/${s}/${e}?color=E8C97A&autoplay=true&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true&sub=true&subLang=en`,
        `https://vidstuck.cc/embed/tv/${id}/${s}/${e}?branding=HackyMax&color=E8C97A&autoplay=true&nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&subtitle=en&sub=true`,
        `https://player.cinezo.live/embed/tv/${id}/${s}/${e}?autoplay=true&opacity=1&fontsize=20&fontcolor=ffffff&sub=true&subLang=en&primarycolor=e8b86d&secondarycolor=0a0a12`,
        `https://vidlove.cc/embed/tv/${id}/${s}/${e}?autoplay=true&showNextEpisode=1&sub=true&subLang=en`,
        `https://player.videasy.ws/embed/tv/${id}/${s}/${e}?autoplay=1&autonext=1&ds_lang=en&sub=1&subtitles=true`,
        `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=true&nextEpisode=true&episodeSelector=true&sub.mode=auto&sub.lang=en`,
        `https://cdn.vidspark.to/tv/${id}/${s}/${e}?autoplay=true&sub=true&subLang=en`,
        `https://player.vidzee.wtf/embed/tv/${id}/${s}/${e}?sub=true&subLang=en`,
        `https://vidbolt.xyz/tv/${id}/${s}/${e}?theme=E8C97A&autoPlay=true&sub=true&subLang=en`
      ];
    }
  } else {
    // Movie
    if (hasSinhalaSub) {
      urls = [
        `https://vidy.st/movie/${id}?color=E8C97A&autoplay=true&sub=false&subtitles=false&cc=false&subLang=none`,
        `https://vidstuck.cc/embed/movie/${id}?branding=HackyMax&color=E8C97A&autoplay=true&subtitle=off&sub=false&subtitles=false&cc=false`,
        `https://player.cinezo.live/embed/movie/${id}?autoplay=true&opacity=0&fontsize=0&fontcolor=transparent&sub=false&subtitles=false&primarycolor=e8b86d&secondarycolor=0a0a12`,
        `https://vidlove.cc/embed/movie/${id}?autoplay=true&sub=false&subtitles=false&cc=false`,
        `https://player.videasy.ws/embed/movie/${id}?autoplay=1&ds_lang=bre&sub=0&subtitles=false`,
        `https://vidlink.pro/movie/${id}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=true&sub.mode=off`,
        `https://cdn.vidspark.to/movie/${id}?autoplay=true&sub=false&subtitles=false&cc=false`,
        `https://player.vidzee.wtf/embed/movie/${id}?sub=false&subtitles=false`,
        `https://vidbolt.xyz/movie/${id}?theme=E8C97A&autoPlay=true&sub=false&subtitles=false`
      ];
    } else {
      urls = [
        `https://vidy.st/movie/${id}?color=E8C97A&autoplay=true&sub=true&subLang=en`,
        `https://vidstuck.cc/embed/movie/${id}?branding=HackyMax&color=E8C97A&autoplay=true&subtitle=en&sub=true`,
        `https://player.cinezo.live/embed/movie/${id}?autoplay=true&opacity=1&fontsize=20&fontcolor=ffffff&sub=true&subLang=en&primarycolor=e8b86d&secondarycolor=0a0a12`,
        `https://vidlove.cc/embed/movie/${id}?autoplay=true&sub=true&subLang=en`,
        `https://player.videasy.ws/embed/movie/${id}?autoplay=1&ds_lang=en&sub=1&subtitles=true`,
        `https://vidlink.pro/movie/${id}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=true&sub.mode=auto&sub.lang=en`,
        `https://cdn.vidspark.to/movie/${id}?autoplay=true&sub=true&subLang=en`,
        `https://player.vidzee.wtf/embed/movie/${id}?sub=true&subLang=en`,
        `https://vidbolt.xyz/movie/${id}?theme=E8C97A&autoPlay=true&sub=true&subLang=en`
      ];
    }
  }

  // Prevent caching so new server labels appear instantly
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).json({ urls, labels });
}
