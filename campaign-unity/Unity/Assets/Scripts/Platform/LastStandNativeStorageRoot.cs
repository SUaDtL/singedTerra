using System;
using System.IO;

namespace SingedTerra.LastStand
{
    // Select once before any native record is opened. Failure is cached too:
    // malformed verification arguments must never fall back to the normal save.
    internal static class LastStandNativeStorageRoot
    {
        const string Option = "--last-stand-test-profile";
#if (UNITY_ANDROID || UNITY_STANDALONE) && !UNITY_EDITOR
        static readonly Lazy<string> Selected = new Lazy<string>(() => Resolve(
            UnityEngine.Application.persistentDataPath, Environment.GetCommandLineArgs(),
#if DEVELOPMENT_BUILD
            true
#else
            false
#endif
        ));
        internal static string Current => Selected.Value;
#endif
        internal static string Resolve(string persistentRoot,string[] arguments,bool developmentBuild)
        {
            if(arguments==null)throw new IOException("Native launch arguments are unavailable.");
            string identifier=null;
            foreach(string argument in arguments)
                if(argument==null)throw new IOException("Native launch arguments are invalid.");
            for(int i=1;i<arguments.Length;i++)
            {
                string argument=arguments[i];
                if(!argument.StartsWith(Option,StringComparison.OrdinalIgnoreCase))continue;
                if(!developmentBuild)throw new IOException("A native verification profile requires a development build.");
                if(argument!=Option || identifier!=null || i+1==arguments.Length)
                    throw new IOException("Specify one native verification profile with a separate identifier.");
                identifier=arguments[++i];
                // Leave room for the native adapter's encoded key and atomic
                // temporary suffix on Windows hosts with legacy path limits.
                if(identifier.Length<1 || identifier.Length>32 || !AsciiLetterOrDigit(identifier[0]))
                    throw new IOException("Native verification profile identifiers require 1 to 32 ASCII letters, digits, hyphens or underscores, beginning with a letter or digit.");
                foreach(char value in identifier)
                    if(!AsciiLetterOrDigit(value) && value!='-' && value!='_')
                        throw new IOException("Native verification profile identifiers cannot contain paths or non-ASCII characters.");
                string upper=identifier.ToUpperInvariant();
                if(upper=="CON" || upper=="PRN" || upper=="AUX" || upper=="NUL" ||
                    (upper.Length==4 && (upper.StartsWith("COM",StringComparison.Ordinal) || upper.StartsWith("LPT",StringComparison.Ordinal)) && upper[3]>='1' && upper[3]<='9'))
                    throw new IOException("Native verification profile identifiers cannot use reserved device names.");
            }
            if(identifier==null)return persistentRoot;
            if(String.IsNullOrWhiteSpace(persistentRoot) || !Path.IsPathRooted(persistentRoot))
                throw new IOException("Native verification profiles require an absolute persistent root.");
            // The existing file adapter checks every ancestor for links before
            // creating directories and again before each read/write/lease action.
            return Path.Combine(persistentRoot,"VerificationProfiles",identifier);
        }
        static bool AsciiLetterOrDigit(char value)=>
            (value>='a' && value<='z') || (value>='A' && value<='Z') || (value>='0' && value<='9');
    }
}
